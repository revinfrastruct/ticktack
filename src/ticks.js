const aws = require('aws-sdk');
const exec = require('child-process-promise').exec;
const fs = require('fs-promise');
const md5 = require('md5-file/promise');
const q = require('q');
const request = require('request-promise');
const smplcnf = require('smplcnf');
const url = require('url');

const config = smplcnf();
var s3;

const delete_tick = id => {
	return q.fcall(() => {
		data['+'] = data['+'].filter(item => id !== item.id);
		if (data['-'].indexOf(id) === -1) {
			data['-'].push(id);
		}
	});
};

const find_tick = id => {
	return q.fcall(() => {
		return data['+'].filter(item => item.id === id);
	})
	.then(matches => {
		if (matches.length === 0) {
			throw new Error('No tick was found.');
		}
		return matches[0]; // Return the first one. (Hope there is just one.)
	});
};

const flush_data = () => {
	return q.fcall(() => {
		data['+'] = [];
		data['-'] = [];
	});
};

const get_bucket = () => {
	return config('s3.bucket', 'mybucket');
};

const get_media_path = () => {
	return config('s3.media_path', '/ticktack/media')
	.then(path => {
		if (path.charAt(0) === '/') {
			return path.substr(1);
		}
		return path;
	});
};

const get_region = () => {
	return config('s3.region', 'eu-central-1');
};

const get_s3_path = () => {
	return config('feeds.full', '/ticktack/ticker.json')
	.then(path => {
		if (path.charAt(0) === '/') {
			return path.substr(1);
		}
		return path;
	});
};

const get_s3_initial_path = () => {
	return config('feeds.initial', '/ticktack/ticker-initial.json')
	.then(path => {
		if (path.charAt(0) === '/') {
			return path.substr(1);
		}
		return path;
	});
};

const get_s3_latest_path = () => {
	return config('feeds.latest', '/ticktack/ticker-latest.json')
	.then(path => {
		if (path.charAt(0) === '/') {
			return path.substr(1);
		}
		return path;
	});
};

const http = {
	get: (url) => request(url)
};

const init = () => {
	return q.fcall(() => config.load('config.json'))
	.then(() => get_region())
	.then(region => {
		s3 = new aws.S3({
			apiVersion: '2006-03-01',
			region: region
		});
	});
};

const initial_data = () => {
	return q.fcall(() => {
		const initdata = {
			"+": [],
			"-": data["-"]
		};
		let first = data["+"].length - 10;
		if (first < 0) first = 0;
		for (let i = first; i < data["+"].length; i++) {
			initdata['+'].push(data['+'][i]);
		}
		return initdata;
	});
};

const latest_data = () => {
	return q.fcall(() => {
		const latest = {
			"+": [],
			"-": data["-"]
		};
		latest['+'] = data['+'].filter(item => item.updated >= now() - (60 * 5));
		return latest;
	});
};

const load_ticks = () => {
	return static_website_url()
	.then(http.get)
	.catch(err => {
		if (err.statusCode === 403) {
			return {};
		}
		throw new Error('Could not read current ticks from Amazon S3.');
	})
	.then(newdata => {
		if (typeof newdata === 'string') {
			return JSON.parse(newdata);
		}
		return newdata;
	})
	.then(newdata => {
		if (typeof newdata['-'] !== 'undefined') {
			return q.all(newdata['-'].map(item => delete_tick(item)))
			.then(() => {
				return newdata;
			});
		}
		return newdata;
	})
	.then(newdata => {
		if (typeof newdata['+'] !== 'undefined') {
			return q.all(newdata['+'].map(item => {
				return set_tick(item.id, item.content, item.time, item.important, item.media)
				.then(() => {
					if (item.updated) {
						return set_updated_timestamp(item.id, item.updated);
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
};

const now = () => Math.floor((new Date()).getTime() / 1000);

const normalize_tick = data => {
	return q.fcall(() => {
		var result = { // Default values:
			"content": "",
			"time": now(),
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
};

const s3upload = (s3_key, data, content_type, content_encoding) => {
	return q.all([ get_bucket(), get_region() ])
	.spread((bucket, region) => {
		return q.fcall(() => {
			const deferred = q.defer();
			const options = {
				Bucket: bucket,
				Key: s3_key,
				ACL: 'public-read'
			};
			if (typeof data === 'object') {
				options.Body = JSON.stringify(data);
				options.ContentType = 'application/json';
				options.ContentEncoding = 'utf-8';
			} else {
				options.Body = data;
			}
			if (content_type) {
				options.ContentType = content_type;
			}
			if (content_encoding) {
				options.ContentEncoding;
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
	});
};

const set_tick = (id, content, time, important, media) => {
	return normalize_tick({
		id: id,
		content: content,
		time: time,
		important: important,
		media: media,
		updated: now()
	})
	.then(newtick => {
		if (typeof newtick.media === 'undefined') {
			return newtick;
		}
		return store_media(newtick.media)
		.then(media => {
			newtick.media = media;
			return newtick;
		});
	})
	.then(newtick => {
		return find_tick(newtick.id)
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
			data['+'].push(newtick);
			data['-'] = data['-'].filter(item => item !== newtick.id);
		});
	})
	.then(() => sort_data());
};

const set_updated_timestamp = (id, time) => {
	return find_tick(id)
	.then(tick => {
		if (typeof time === 'number') {
			tick.updated = time;
		} else {
			tick.updated = now();
		}
	})
	.then(() => sort_data());
};

const sort_data = () => {
	return q.fcall(() => {
		data['+'].sort((a, b) => a.updated - b.updated);
	});
};

const static_website_url = () => {
	return q.all([ get_bucket(), get_region(), get_s3_path() ])
	.spread((bucket, region, path) => {
		return `https://${bucket}.s3.amazonaws.com/${path}`;
	});
};

const store_media = oldmedia => {
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

			return q.all([ get_media_path(), md5(oldmedia.src), fs.readFile(oldmedia.src) ])
			.spread((s3_path, checksum, filedata) => {
				return s3upload(s3_path + '/' + checksum + '.jpg', filedata, 'image/jpeg');
			})
			.then(s3_key => {
				return get_bucket()
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
};

const store_ticks = () => {
	return q.all([
		store_full_ticks(),
		store_initial_ticks(),
		store_latest_ticks()
	]);
};

const store_full_ticks = () => {
	return get_s3_path()
	.then(s3_key => s3upload(s3_key, data));
};

const store_initial_ticks = () => {
	return q.all([ get_s3_initial_path(), initial_data() ])
	.spread((s3_key, data) => {
		return s3upload(s3_key, data);
	});
};

const store_latest_ticks = () => {
	return q.all([ get_s3_latest_path(), latest_data() ])
	.spread((s3_key, data) => {
		return s3upload(s3_key, data);
	});
};

const data = {
	"+": [],
	"-": []
};

module.exports = {
	config,
	data,
	delete_tick,
	flush_data,
	get_bucket,
	get_region,
	get_s3_path,
	http,
	init,
	load_ticks,
	normalize_tick,
	now,
	set_tick,
	set_updated_timestamp,
	static_website_url,
	store_ticks
};
