const aws = require('aws-sdk');
const q = require('q');
const request = require('request-promise');
const smplcnf = require('smplcnf');
const url = require('url');

const config = smplcnf();
const s3 = new aws.S3();

const delete_tick = (key) => {
	return q.fcall(() => {
		if (typeof ticks[key] !== 'undefined') {
			delete ticks[key];
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
	return config('aws.config', 'mybucket');
};

const get_region = () => {
	return config('aws.region', 'eu-central-1');
};

const get_s3_key = () => {
	return static_website_url
	.then(url => {
		const urlparts = url.parse(ticks_url);
		return urlparts.path;
	});
};

const get_tickername = () => {
	return config('ticker.name', 'test');
};

const http = {
	get: (url) => request(url)
};

const init = () => {
	config.load('config.json');
};

const load_ticks = () => {
	return static_website_url()
	.then(http.get)
	.then(data => {
		return flush_ticks()
		.then(() => {
			var normalize_all = [];
			Object.keys(data).forEach(key => {
				normalize_all.push(
					normalize_tick(data[key])
					.then(data => {
						ticks[key] = data;
					})
				);
			});
			return q.all(normalize_all);
		});
	});
};

const normalize_tick = data => {
	return q.fcall(() => {
		const result = { // Default values:
			"content": "",
			"time": Math.round((new Date()).getTime() / 1000),
			"important": false
		};
		if (data.content) result.content = data.content;
		if (data.time) result.time = data.time;
		if (data.important) result.important = data.important;
		return result;
	});
};

const set_tick = (id, content, time, important) => {
	return q.fcall(() => {
		let tick = normalize_tick({
			"content": content,
			"time": time,
			"important": important
		})
		.then(() => {
			ticks[id] = tick;
		});
	});
};

const static_website_url = () => {
	return q.all([ get_bucket(), get_region(), get_tickername() ])
	.spread((bucket, region, tickername) => {
		return `https://${bucket}.s3-website.${region}.amazonaws.com/tickers/${tickername}/ticks.json`;
	});
};

const store_ticks = () => {
	return q.all([ get_bucket(), get_region(), get_s3_key() ])
	.spread((bucket, region, s3_key) => {
		let deferred = q.defer();
		s3.putObject({
			Bucket: bucket,
			Key: s3_key,
			Body: json.stringify(ticks)
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

const ticks = {};

module.exports = {
	config: config,
	delete_tick: delete_tick,
	flush_ticks: flush_ticks,
	get_bucket: get_bucket,
	get_region: get_region,
	get_tickername: get_tickername,
	http: http,
	init: init,
	load_ticks: load_ticks,
	normalize_tick: normalize_tick,
	static_website_url: static_website_url,
	store_ticks: store_ticks,
	ticks: ticks
};
