const aws = require('aws-sdk');
const exec = require('child-process-promise').exec;
const fs = require('fs-promise');
const q = require('q');
const sha3_256 = require('js-sha3').sha3_256;
const smplcnf = require('smplcnf');
const url = require('url');

const config = smplcnf();
var s3;

class Ticks {

	constructor() {
		this.config = config; // Unit tests wants access to this.
		this.data = {
			'+': [],
			'-': []
		};
	}

	delete_tick(id) {
		return q.fcall(() => {
			this.data['+'] = this.data['+'].filter(item => id !== item.id);
			if (this.data['-'].indexOf(id) === -1) {
				this.data['-'].push(id);
			}
		});
	}

	find_tick(id) {
		return q.fcall(() => {
			const match = this.data['+'].find(item => item.id === id);
			if (typeof match === 'undefined') {
				throw new Error('No tick was found.');
			}
			return match;
		});
	}

	flush_data() {
		return q.fcall(() => {
			this.data['+'] = [];
			this.data['-'] = [];
		});
	}

	generate_partial_feeds() {
		return this.get_partial_feed_definitions()
		.then(defs => {
			const result = [];
			return q.all(defs.map((def, index) => {
				result.push(
					{
						key: def.key,
						data: {
							'+': this.data['+'].filter(item => {
								if (defs.max_age) {
									if (now() - item.updated > defs.max_age) {
										return false;
									}
								}
								if (defs.max_items) {
									if (index <= (data['+'].length - defs.max_items)) {
										return false;
									}
								}
								return true;
							}),
							'-': this.data['-']
						}
					}
				);
			}))
			.then(() => result);
		});
	}

	get_bucket() {
		return config('s3.bucket', 'mybucket');
	}

	get_media_path() {
		return config('s3.media_path', '/ticktack/media')
		.then(path => {
			if (path.charAt(0) === '/') {
				return path.substr(1);
			}
			return path;
		});
	}

	get_partial_feed_definitions() {
		return config('feeds.partial', []);
	}

	get_region() {
		return config('s3.region', 'eu-central-1');
	}

	get_s3_path() {
		return config('feeds.full.key', '/ticktack/ticker.json')
		.then(path => {
			if (path.charAt(0) === '/') {
				return path.substr(1);
			}
			return path;
		});
	}

	hash_file(file) {
		const deferred = q.defer();
		const hash = sha3_256.create();
		const stream = fs.createReadStream(file);
		stream.on('data', chunk => {
			hash.update(chunk);
		});
		stream.on('end', () => {
			deferred.resolve(hash.hex());
		});
		stream.on('error', err => {
			deferred.reject(err);
		});
		return deferred.promise;
	}

	init() {
		return q.fcall(() => config.load('config.json'))
		.then(() => this.get_region())
		.then(region => {
			s3 = new aws.S3({
				apiVersion: '2006-03-01',
				region: region
			});
		});
	}

	load_ticks() {
		return this.get_s3_path()
		.then(s3_key => this.s3download(s3_key))
		.catch(err => {
			if (err.statusCode === 403) {
				return {};
			}
			throw new Error('Could not read current ticks from Amazon S3.');
		})
		.then(newdata => {
			if (Buffer.isBuffer(newdata.Body)) {
				return JSON.parse(newdata.Body.toString());
			} else {
				return newdata.Body;
			}
		})
		.then(newdata => {
			if (typeof newdata['-'] !== 'undefined') {
				return q.all(newdata['-'].map(item => this.delete_tick(item)))
				.then(() => {
					return newdata;
				});
			}
			return newdata;
		})
		.then(newdata => {
			if (typeof newdata['+'] !== 'undefined') {
				return q.all(newdata['+'].map(item => {
					return this.set_tick(item.id, item.content, item.time, item.important, item.media)
					.then(() => {
						if (item.updated) {
							return this.set_updated_timestamp(item.id, item.updated);
						} else {
							return;
						}
					});
				}))
				.then(() => {
					return newdata;
				});
			}
		});
	}

	now() {
		return Math.floor((new Date()).getTime() / 1000);
	}

	normalize_tick(data) {
		return q.fcall(() => {
			var result = { // Default values:
				"content": "",
				"time": this.now(),
				"important": false
			};
			if (typeof data.id === 'undefined') {
				throw new Error('No ID in tick data.');
			}
			if (typeof data.media === 'string' && data.media !== '') {
				result.media = {
					"src": data.media,
					"w": 0,
					"h": 0
				};
			} else if (typeof data.media === 'object') {
				result.media = data.media;
			}
			result.id = data.id;
			if (data.content) result.content = data.content;
			if (data.time) result.time = parseInt(data.time);
			if (data.important) result.important = data.important;
			if (data.updated) {
				result.updated = data.updated;
			} else {
				result.updated = result.time;
			}
			return result;
		});
	}

	s3download(s3_key) {
		return this.get_bucket()
		.then(bucket => {
			const deferred = q.defer();
			s3.getObject({
				Bucket: bucket,
				Key: s3_key
			}, (err, data) => {
				if (err) {
					deferred.reject(err);
				} else {
					deferred.resolve(data);
				}
			});
			return deferred.promise;
		});
	}

	s3exists(s3_key) {
		return this.get_bucket()
		.then(bucket => {
			const deferred = q.defer();
			s3.headObject({
				Bucket: bucket,
				Key: s3_key
			}, (err, data) => {
				if (err) {
					deferred.reject(err);
				} else {
					deferred.resolve(data);
				}
			});
			return deferred.promise;
		});
	}

	s3upload(s3_key, data, options) {
		return this.get_bucket()
		.then(bucket => {
			const deferred = q.defer();
			if (typeof options === 'undefined') options = {};
			const s3_options = Object.assign({
				Bucket: bucket,
				Key: s3_key,
				ACL: 'public-read'
			}, options);
			if (typeof data === 'object') {
				options.Body = JSON.stringify(data);
				options.ContentType = 'application/json';
				options.ContentEncoding = 'utf-8';
			} else {
				options.Body = data;
			}
			s3.putObject(options, err => {
				if (err) {
					deferred.reject(err);
				} else {
					deferred.resolve(s3_key);
				}
			});
			return deferred.promise;
		});
	}

	set_tick(id, content, time, important, media) {
		return this.normalize_tick({
			id: id,
			content: content,
			time: time,
			important: important,
			media: media,
			updated: this.now()
		})
		.then(newtick => {
			if (typeof newtick.media === 'undefined') {
				return newtick;
			}
			return this.store_media(newtick.media)
			.then(media => {
				newtick.media = media;
				return newtick;
			});
		})
		.then(newtick => {
			return this.find_tick(newtick.id)
			.then(oldtick => {
				let changed = false;
				if (oldtick.content !== newtick.content) {
					oldtick.content = newtick.content;
					changed = true;
				}
				if (oldtick.time !== newtick.time) {
					oldtick.time = newtick.time;
					changed = true;
				}
				if (oldtick.important !== newtick.important) {
					oldtick.important = newtick.important;
					changed = true;
				}
				if (typeof oldtick.media !== typeof newtick.media) {
					oldtick.media = newtick.media;
					changed = true;
				} else {
					if (typeof oldtick.media === 'object' && typeof newtick.media === 'object') {

						if (oldtick.media.src !== newtick.media.src) {
							oldtick.media.src = newtick.media.src;
							changed = true;
						}
						if (oldtick.media.w !== newtick.media.w) {
							oldtick.media.w = newtick.media.w;
							changed = true;
						}
						if (oldtick.media.h !== newtick.media.h) {
							oldtick.media.h = newtick.media.h;
							changed = true;
						}

					}
				}
				if (changed) {
					oldtick.updated = newtick.updated;
				}
			})
			.catch(() => {
				this.data['+'].push(newtick);
				this.data['-'] = this.data['-'].filter(item => item !== newtick.id);
			});
		})
		.then(() => this.sort_data());
	}

	set_updated_timestamp(id, time) {
		return this.find_tick(id)
		.then(tick => {
			if (typeof time === 'number') {
				tick.updated = time;
			} else {
				tick.updated = this.now();
			}
		})
		.then(() => this.sort_data());
	}

	sort_data() {
		return q.fcall(() => {
			this.data['+'].sort((a, b) => a.updated - b.updated);
			this.data['-'].sort();
		});
	}

	store_media(oldmedia) {
		return fs.exists(oldmedia.src)
		.then(() => {
			return exec('identify ' + oldmedia.src)
			.then(result => {
				const imginfo = result.stdout.split(' ');
				if (imginfo['1'] !== 'JPEG') {
					throw new Error('Not a jpeg image.');
				}

				let width, height;
				[ width, height ] = imginfo['2'].split('x');

				return q.all([ this.get_media_path(), hash_file(oldmedia.src), fs.readFile(oldmedia.src) ])
				.spread((s3_path, checksum, filedata) => {
					let s3_key = s3_path + '/' + checksum + '.jpg';
					return this.s3exists(s3_key)
					.then(exists => {
						if (!exists) {
							return this.s3upload(s3_key, filedata, { ContentType: 'image/jpeg' });
						} else {
							return s3_key;
						}
					});
				})
				.then(s3_key => {
					return this.get_bucket()
					.then(bucket => {
						return `https://${bucket}.s3.amazonaws.com/${s3_key}`;
					});
				})
				.then(newurl => {
					return {
						src: newurl,
						w: width,
						h: height
					};
				});

			});
		})
		.catch(err => {
			return oldmedia;
		});
	}

	store_feeds() {
		return this.store_full_feed()
		.then(this.store_partial_feeds());
	}

	store_full_feed() {
		return this.get_s3_path()
		.then(s3_key => this.s3upload(s3_key, data));
	}

	store_partial_feeds() {
		return generate_partial_feeds()
		.then(feeds => {
			return q.all(feeds.map(feed => {
				return this.s3upload(feed.key, feed.data);
			}));
		});
	}
}

module.exports = new Ticks();
