const expect = require('chai').expect;
const testdouble = require('testdouble');
const ticktack = require('..');
const url = require('url');

describe('Ticktack', () => {

	describe('init()', () => {
		it('should load configuration from config.json', () => {
			ticktack.config.load = testdouble.function();
			ticktack.init();
			testdouble.verify(ticktack.config.load('config.json'));
		});
	});

	describe('get_bucket()', () => {
		it('returns a non-empty string', () => {
			return ticktack.get_bucket()
			.then(bucket => {
				expect(bucket).to.be.a('string');
				expect(bucket).to.not.equal('');
			})
		});
	});

	describe('get_region()', () => {
		it('returns a non-empty string', () => {
			return ticktack.get_region()
			.then(region => {
				expect(region).to.be.a('string');
				expect(region).to.not.equal('');
			})
		});
	});

	describe('get_tickername()', () => {
		it('returns a non-empty string', () => {
			return ticktack.get_tickername()
			.then(ticker => {
				expect(ticker).to.be.a('string');
				expect(ticker).to.not.equal('');
			})
		});
	});

	describe('static_website_url()', () => {
		it('returns a non-empty string', () => {
			return ticktack.static_website_url()
			.then(ticks_url => {
				expect(ticks_url).to.be.a('string');
				const urlparts = url.parse(ticks_url);
				expect(urlparts.protocol).to.equal('https:');
			})
		});
	});

	describe('load_ticks()', () => {
		describe('pass 1', () => {
			const test_data = {
				"4": {
					"content": "<p>Yo</p>",
					"time": 1478316163,
					"important": true
				},
				"10": {
					"content": "<p>Yo</p>",
					"time": 1478316163,
					"important": true
				}
			};
			before(() => {
				ticktack.http.get = testdouble.function();
				return ticktack.static_website_url()
				.then(ticks_url => {
					testdouble.when(ticktack.http.get(ticks_url)).thenResolve(test_data);
				});
			});
			it('should load memory with ticks', () => {
				return ticktack.load_ticks()
				.then(data => {
					expect(ticktack.ticks).to.deep.equal(test_data);
					
					// They should not be the same object, just idential objects:
					test_data['10'].content = '<p>Something else</p>';
					expect(ticktack.ticks).to.not.deep.equal(test_data);
				});
			});
		});
		describe('pass 2', () => {
			const test_data = {
				"10": {
					"content": "<p>Yo</p>",
					"time": 1478316163,
					"important": true
				}
			};
			before(() => {
				ticktack.http.get = testdouble.function();
				return ticktack.static_website_url()
				.then(ticks_url => {
					testdouble.when(ticktack.http.get(ticks_url)).thenResolve(test_data);
				});
			});
			it('should not keep old (key "4") data after loading batch with deleted ticks', () => {
				return ticktack.load_ticks()
				.then(data => {
					expect(ticktack.ticks).to.deep.equal(test_data);
				});
			});
		});
	});

});
