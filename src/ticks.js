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
	return config('s3.path', '/ticktack/ticker.json')
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
			return q.all(newdata['+'].map(item => set_tick(item.id, item.content, item.time, item.important, item.media)))
			.then(() => {
				return newdata;
			});
		}
	});
};

const normalize_tick = data => {
	return q.fcall(() => {
		var result = { // Default values:
			"content": "",
			"time": Math.round((new Date()).getTime() / 1000),
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
		return result;
	});
};

const set_tick = (id, content, time, important, media) => {
	return normalize_tick({
		id: id,
		content: content,
		time: time,
		important: important,
		media: media
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
			if (oldtick.content !== newtick.content) {
				oldtick.content = newtick.content;
			}
			if (oldtick.time !== newtick.time) {
				oldtick.time = newtick.time;
			}
			if (oldtick.important !== newtick.important) {
				oldtick.important = newtick.important;
			}
			if (oldtick.media !== newtick.media) {
				oldtick.media = newtick.media;
			}
		})
		.catch(() => {
			data['+'].push(newtick);
			data['-'] = data['-'].filter(item => item !== newtick.id);
		});
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

			return q.all([ get_bucket(), get_region(), get_media_path(), md5(oldmedia.src), fs.readFile(oldmedia.src) ])
			.spread((bucket, region, s3_path, checksum, filedata) => {
				const s3_key = s3_path + '/' + checksum + '.jpg';
				let deferred = q.defer();
				s3.putObject({
					Bucket: bucket,
					Key: s3_key,
					Body: filedata,
					ACL: 'public-read',
					ContentType: 'image/jpeg'
				}, err => {
					if (err) {
						deferred.reject(err);
					} else {
						deferred.resolve(s3_key);
					}
				});
				return deferred.promise;
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
	return q.all([ get_bucket(), get_region(), get_s3_path() ])
	.spread((bucket, region, s3_key) => {
		let deferred = q.defer();
		s3.putObject({
			Bucket: bucket,
			Key: s3_key,
			Body: JSON.stringify({
				"+": data["+"],
				"-": data["-"].filter(item => item !== '+').filter(item => item !== '-')
			}),
			ACL: 'public-read',
			ContentType: 'application/json',
			ContentEncoding: 'utf-8'
		}, err => {
		if (err) {
			deferred.reject(err);
			} else {
				deferred.resolve();
			}
		});
		return deferred.promise;
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
	get_bucket,
	get_region,
	get_s3_path,
	http,
	init,
	load_ticks,
	normalize_tick,
	set_tick,
	static_website_url,
	store_ticks
};
