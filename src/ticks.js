const aws = require('aws-sdk');
const q = require('q');
const request = require('request-promise');
const smplcnf = require('smplcnf');
const url = require('url');

const config = smplcnf();
var s3;

const delete_tick = (key) => {
	return q.fcall(() => {
		if (typeof ticks[key] !== 'undefined') {
			delete ticks[key];
			if (deletes.indexOf(key) === -1) {
				deletes.push(key);
			}
		}
	});
};

const flush_ticks = () => {
	return q.fcall(() => {
		Object.keys(ticks).forEach(key => {
			delete ticks[key];
		});
	});
};

const get_bucket = () => {
	return config('s3.bucket', 'mybucket');
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

		return;
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
	.then(data => {
		if (typeof data === 'string') {
			return JSON.parse(data);
		}
		return data;
	})
	.then(data => {
		if (typeof data['-'] !== 'undefined') {
			data['-'].forEach(key => {
				if (deletes.indexOf(key) === -1) {
					deletes.push(key);
				}
				if (typeof ticks[key] !== 'undefined') {
					delete ticks[key];
				}
			});
		}
		return flush_ticks()
		.then(() => {
			var normalize_all = [];
			Object.keys(data).forEach(key => {
				if (key !== '-') {
					normalize_all.push((key => {
						return normalize_tick(data[key])
						.then(data => {
							ticks[key] = data;
							if (deletes.indexOf(key) !== -1) {
								deletes.splice(deletes.indexOf(key), 1);
							}
						})
					})(key));
				}
			});
			return q.all(normalize_all);
		});
	});
};

const normalize_tick = data => {
	return q.fcall(() => {
		var result = { // Default values:
			"content": "",
			"time": Math.round((new Date()).getTime() / 1000),
			"important": false
		};
		if (data.content) result.content = data.content;
		if (data.time) result.time = parseInt(data.time);
		if (data.important) result.important = data.important;
		return result;
	});
};

const set_tick = (id, content, time, important) => {
	return q.fcall(() => {
		normalize_tick({
			"content": content,
			"time": time,
			"important": important
		})
		.then(tick => {
			ticks[id] = tick;
			if (deletes.indexOf(id) !== -1) {
				deletes.splice(deletes.indexOf(id), 1);
			}
		});
	});
};

const static_website_url = () => {
	return q.all([ get_bucket(), get_region(), get_s3_path() ])
	.spread((bucket, region, path) => {
		return `https://${bucket}.s3.amazonaws.com/${path}`;
	});
};

const store_ticks = () => {
	return q.all([ get_bucket(), get_region(), get_s3_path() ])
	.spread((bucket, region, s3_key) => {
		let deferred = q.defer();
		ticks['-'] = deletes;
		s3.putObject({
			Bucket: bucket,
			Key: s3_key,
			Body: JSON.stringify(ticks),
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
		delete ticks['-'];
		return deferred.promise;
	});
};

const ticks = {};
const deletes = [];

module.exports = {
	config: config,
	delete_tick: delete_tick,
	flush_ticks: flush_ticks,
	get_bucket: get_bucket,
	get_region: get_region,
	get_s3_path: get_s3_path,
	http: http,
	init: init,
	load_ticks: load_ticks,
	normalize_tick: normalize_tick,
	set_tick: set_tick,
	static_website_url: static_website_url,
	store_ticks: store_ticks,
	ticks: ticks
};
