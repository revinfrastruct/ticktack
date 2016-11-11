const expect = require('chai').expect;
const testdouble = require('testdouble');
const ticks = require('../src/ticks');
const url = require('url');

describe('ticks', () => {

	describe('init()', () => {
		it('should load configuration from config.json', () => {
			ticks.config.load = testdouble.function();
			return ticks.init()
			.then(() => {
				testdouble.verify(ticks.config.load('config.json'));
			});
		});
	});

	describe('get_bucket()', () => {
		it('returns a non-empty string', () => {
			return ticks.get_bucket()
			.then(bucket => {
				expect(bucket).to.be.a('string');
				expect(bucket).to.not.equal('');
			})
		});
	});

	describe('get_region()', () => {
		it('returns a non-empty string', () => {
			return ticks.get_region()
			.then(region => {
				expect(region).to.be.a('string');
				expect(region).to.not.equal('');
			})
		});
	});

	describe('get_s3_path()', () => {
		it('returns a non-empty string', () => {
			return ticks.get_s3_path()
			.then(path => {
				expect(path).to.be.a('string');
				expect(path).to.not.equal('');
			})
		});
	});

	describe('static_website_url()', () => {
		it('returns a non-empty string', () => {
			return ticks.static_website_url()
			.then(ticks_url => {
				expect(ticks_url).to.be.a('string');
				const urlparts = url.parse(ticks_url);
				expect(urlparts.protocol).to.equal('https:');
			})
		});
	});

	describe('load_ticks()', () => {
		const test_data = {
			"+": [
				{
					"id": "4",
					"content": "<p>Yo</p>",
					"time": 1478316164,
					"important": true
				},
				{
					"id": "10",
					"content": "<p>Yo yo</p>",
					"time": 1478316163,
					"important": false
				}
			]
		};
		describe('pass 0', () => {
			before(() => {
				ticks.http.get = testdouble.function();
				return ticks.static_website_url()
				.then(ticks_url => {
					testdouble.when(ticks.http.get(ticks_url)).thenResolve([]);
				});
			});
			it('should be blank if no data was loaded', () => {
				return ticks.load_ticks()
				.then(data => {
					expect(ticks.data).to.deep.equal({
						"+": [], "-": []
					});
				});
			});
		});
		describe('pass 1', () => {
			before(() => {
				ticks.http.get = testdouble.function();
				return ticks.static_website_url()
				.then(ticks_url => {
					testdouble.when(ticks.http.get(ticks_url)).thenResolve(test_data);
				});
			});
			it('should load memory with ticks', () => {
				return ticks.load_ticks()
				.then(data => {
					expect(ticks.data['+']).to.deep.equal(test_data['+']);
					
					// They should not be the same object, just idential objects:
					test_data['+'][0].content = '<p>Something else</p>';
					expect(ticks.data['+']).to.not.deep.equal(test_data['+']);
				});
			});
		});
		describe('pass 2', () => {
			before(() => {
				ticks.http.get = testdouble.function();
				return ticks.static_website_url()
				.then(ticks_url => {
					testdouble.when(ticks.http.get(ticks_url)).thenResolve({
						"+": [ test_data['+'][0] ]
					});
				});
			});
			it('should keep stuff in memory if not deleted', () => {
				return ticks.load_ticks()
				.then(data => {
					expect(ticks.data['+']).to.deep.equal(test_data['+']);
				});
			});
		});
		describe('pass 3', () => {
			const pass_3_test_data = {
				"-": [ test_data['+'][1].id ]
			};
			before(() => {
				ticks.http.get = testdouble.function();
				return ticks.static_website_url()
				.then(ticks_url => {
					testdouble.when(ticks.http.get(ticks_url)).thenResolve(pass_3_test_data);
				});
			});
			it('should delete ticks marked for deletion', () => {
				return ticks.load_ticks()
				.then(data => {
					expect(ticks.data['+']).to.deep.equal([ test_data['+'][0] ]);
					expect(ticks.data['-']).to.deep.equal([ test_data['+'][1].id ]);
				});
			});
		});
		describe('pass 4', () => {
			before(() => {
				ticks.http.get = testdouble.function();
				return ticks.static_website_url()
				.then(ticks_url => {
					testdouble.when(ticks.http.get(ticks_url)).thenResolve(test_data);
				});
			});
			it('should remove ticks from deleted array if they are re-added', () => {
				return ticks.load_ticks()
				.then(data => {
					expect(ticks.data['+']).to.deep.equal(test_data['+']);
					expect(ticks.data['-']).to.deep.equal([]);
				});
			});
		});
	});

});
