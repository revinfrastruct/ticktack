const expect = require('chai').expect;
const testdouble = require('testdouble');
const ticks = require('../src/ticks');
const url = require('url');

describe('ticks', () => {

	const test_data = {
		"+": [
			{
				"id": "4",
				"content": "<p>Yo</p>",
				"time": 1478316163,
				"important": true
			},
			{
				"id": "10",
				"content": "<p>Yo yo</p>",
				"time": 1478316164,
				"important": false
			}
		]
	};

	const test_data_loader = (data) => {
		return () => {
			ticks.http.get = testdouble.function();
			return ticks.static_website_url()
			.then(ticks_url => {
				testdouble.when(ticks.http.get(ticks_url)).thenResolve(data);
			});
		};
	};

	describe('flush_data()', () => {
		before(test_data_loader(test_data));
		it('should flush all items, including deletes', () => {
			return ticks.flush_data()
			.then(() => ticks.load_ticks())
			.then(() => {
				expect(ticks.data['+'].length).to.equal(2);
			})
			.then(() => ticks.flush_data())
			.then(() => {
				expect(ticks.data['+'].length).to.equal(0);
			});
		});
		after(() => testdouble.reset());
	});

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
		describe('pass 0', () => {
			before(test_data_loader([]));
			it('should be blank if no data was loaded', () => {
				return ticks.load_ticks()
				.then(data => {
					expect(ticks.data).to.deep.equal({
						"+": [], "-": []
					});
				});
			});
			after(() => testdouble.reset());
		});
		describe('pass 1', () => {
			before(test_data_loader(test_data));
			it('should load memory with ticks', () => {
				return ticks.load_ticks()
				.then(() => {
					// Use clone, so we safely can remove the updated property:
					ticks_data = Object.assign({}, ticks.data);
					// Dont include updated in comparison:
					delete ticks_data['+'][0]['updated'];
					delete ticks_data['+'][1]['updated'];

					expect(ticks_data['+']).to.deep.equal(test_data['+']);
					
					// They should not be the same object, just idential objects:
					test_data['+'][0].content = '<p>Something else</p>';
					expect(ticks_data['+']).to.not.deep.equal(test_data['+']);
				});
			});
			after(() => testdouble.reset());
		});
		describe('pass 2', () => {
			before(test_data_loader({
				"+": [ test_data['+'][0] ]
			}));
			it('should keep stuff in memory if not deleted', () => {
				return ticks.load_ticks()
				.then(data => {
					// Use clone, so we safely can remove the updated property:
					ticks_data = Object.assign({}, ticks.data);
					// Dont include updated in comparison:
					delete ticks_data['+'][0]['updated'];
					delete ticks_data['+'][1]['updated'];

					expect(ticks_data['+']).to.deep.equal(test_data['+']);
				});
			});
			after(() => testdouble.reset());
		});
		describe('pass 3', () => {
			before(test_data_loader({
				"-": [ test_data['+'][1].id ]
			}));
			it('should delete ticks marked for deletion', () => {
				return ticks.load_ticks()
				.then(data => {
					expect(ticks.data['+']).to.deep.equal([ test_data['+'][0] ]);
					expect(ticks.data['-']).to.deep.equal([ test_data['+'][1].id ]);
				});
			});
			after(() => testdouble.reset());
		});
		describe('pass 4', () => {
			before(test_data_loader(test_data));
			it('should remove ticks from deleted array if they are re-added', () => {
				return ticks.load_ticks()
				.then(data => {
					// Use clone, so we safely can remove the updated property:
					ticks_data = Object.assign({}, ticks.data);
					// Dont include updated in comparison:
					delete ticks_data['+'][0]['updated'];
					delete ticks_data['+'][1]['updated'];

					expect(ticks_data['+']).to.deep.equal(test_data['+']);
					expect(ticks_data['-']).to.deep.equal([]);
				});
			});
			after(() => testdouble.reset());
		});
	});

	describe('Updated property', () => {
		before(test_data_loader(test_data));
		it('should be added if there is none', () => {
			return ticks.flush_data()
			.then(() => ticks.load_ticks())
			.then(() => {
				expect(typeof ticks.data['+'][0].updated).to.equal('number');
				expect(typeof ticks.data['+'][1].updated).to.equal('number');
			});
		});
		it('should not change when loading remote ticks', () => {
			test_data['+'][0].updated = 123;
			test_data['+'][1].updated = 456;
			return ticks.flush_data()
			.then(() => ticks.load_ticks())
			.then(() => {
				expect(ticks.data['+'][0].updated).to.equal(123);
				expect(ticks.data['+'][1].updated).to.equal(456);
			});
		});
		it('should not be updated if calling set_tick without changes', () => {
			return ticks.set_tick(
				test_data['+'][0].id, 
				test_data['+'][0].content, 
				test_data['+'][0].time, 
				test_data['+'][0].important 
			)
			.then(() => {
				expect(ticks.data['+'][0].updated).to.equal(123);
			});
		});
		it('should be updated if calling set_tick with changed content', () => {
			return ticks.set_tick(
				test_data['+'][0].id, 
				test_data['+'][0].content + 'test', 
				test_data['+'][0].time, 
				test_data['+'][0].important 
			)
			.then(() => {
				// NOTE: They swapped place (index) because the data['+'] is
				// sorted on the .updated property.
				expect(ticks.data['+'][0].updated).to.equal(456);
				expect(ticks.data['+'][1].updated).to.be.above(ticks.now() - 2);
			});
		});
		it('should be updated if calling set_updated_timestamp() with a time', () => {
			return ticks.set_updated_timestamp(
				test_data['+'][0].id, 
				123
			)
			.then(() => {
				expect(ticks.data['+'][0].updated).to.equal(123);
			});
		});
		it('should be updated if calling set_tick with changed time', () => {
			return ticks.set_tick(
				test_data['+'][0].id, 
				test_data['+'][0].content, 
				test_data['+'][0].time - 10, 
				test_data['+'][0].important 
			)
			.then(() => {
				// NOTE: They swapped place (index) because the data['+'] is
				// sorted on the .updated property.
				expect(ticks.data['+'][0].updated).to.equal(456);
				expect(ticks.data['+'][1].updated).to.be.above(ticks.now() - 2);
			});
		});
		it('should be updated if calling set_tick with changed important', () => {
			return ticks.set_updated_timestamp(
				test_data['+'][0].id, 
				123
			).then(() => {
				return ticks.set_tick(
					test_data['+'][1].id, 
					test_data['+'][1].content, 
					test_data['+'][1].time, 
					test_data['+'][1].important = true
				)
			})
			.then(() => {
				expect(ticks.data['+'][0].updated).to.equal(123);
				expect(ticks.data['+'][1].updated).to.be.above(ticks.now() - 2);
			});
		});
		after(() => testdouble.reset());
	});
});
