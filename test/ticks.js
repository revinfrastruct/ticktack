const expect = require('chai').expect;
const fs = require('fs-promise');
const tempfile = require('tempfile');
const testdouble = require('testdouble');
const ticks = require('../src/ticks');
const url = require('url');

const testdata1 = require('./testfile1.json');
const testdata2 = require('./testfile2.json');

describe('ticks', () => {

	const test_data_loader = (data) => {
		return () => {
			ticks.s3download = testdouble.function();
			return ticks.get_s3_path()
			.then(s3_key => {
				testdouble.when(ticks.s3download(s3_key)).thenResolve({
					Body: data
				});
			});
		};
	};

	describe('delete_tick()', () => {
		before(test_data_loader(testdata1));
		it('should remove ticks', () => {
			const id = testdata1['+'][0].id;
			const other_id = testdata1['+'][1].id;
			return ticks.flush_data()
			.then(() => ticks.load_ticks())
			.then(() => ticks.delete_tick(id))
			.then(() => {
				expect(ticks.data['-']).to.deep.equal([ id ]);
				expect(ticks.data['+'][0].id).to.equal(other_id);
				expect(ticks.data['+'].length).to.equal(1);
			});
		});
	});

	describe('find_tick()', () => {
		before(test_data_loader(testdata1));
		it('to return the tick you asked for', () => {
			return ticks.flush_data()
			.then(() => ticks.load_ticks())
			.then(() => ticks.find_tick(ticks.data['+'][0].id))
			.then(result => {
				expect(result).to.deep.equal(ticks.data['+'][0]);
			})
			.then(() => ticks.find_tick(ticks.data['+'][1].id))
			.then(result => {
				expect(result).to.deep.equal(ticks.data['+'][1]);
			});
		});
	});

	describe('flush_data()', () => {
		before(test_data_loader(testdata1));
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

	describe('get_bucket()', () => {
		it('returns a non-empty string', () => {
			return ticks.get_bucket()
			.then(bucket => {
				expect(bucket).to.be.a('string');
				expect(bucket).to.not.equal('');
			})
		});
	});

	describe('get_ids()', () => {
	});

	describe('get_media_path()', () => {
		it('returns a non-empty string', () => {
			return ticks.get_media_path()
			.then(path => {
				expect(path).to.be.a('string');
				expect(path).to.not.equal('');
			})
		});
	});

	describe('get_partial_feed_definitions()', () => {
		it('returns an array', () => {
			return ticks.get_partial_feed_definitions()
			.then(def => {
				expect(Array.isArray(def)).to.equal(true);
			});
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

	describe('hash_file()', () => {
		it('should return sha3-256 hash of file content.', () => {
			const file = tempfile();
			return fs.writeFile(file, 'The quick brown fox jumps over the lazy dog.')
			.then(() => ticks.hash_file(file))
			.then(hash => {
				fs.unlink(file); // Clean-up.
				expect(hash).to.equal('a80f839cd4f83f6c3dafc87feae470045e4eb0d366397d5c6ce34ba1739f734d');
			});
		});
		it('should result in a rejected promise if file does not exist.', () => {
			let error;
			return ticks.hash_file('/this/is/a/non-existing/file/i/hope')
			.catch(err => {
				error = err;
			})
			.then(() => {
				expect(error.code).to.equal('ENOENT');
			});
		});
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

	describe('latest_data()', () => {
		before(test_data_loader(testdata2));
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
			before(test_data_loader(testdata1));
			it('should load memory with ticks', () => {
				return ticks.load_ticks()
				.then(() => {
					// Use clone, so we safely can remove the updated property:
					ticks_data = Object.assign({}, ticks.data);
					// Dont include updated in comparison:
					delete ticks_data['+'][0]['updated'];
					delete ticks_data['+'][1]['updated'];

					expect(ticks_data['+']).to.deep.equal(testdata1['+']);
					
					// They should not be the same object, just idential objects:
					testdata1['+'][0].content = '<p>Something else</p>';
					expect(ticks_data['+']).to.not.deep.equal(testdata1['+']);
				});
			});
			after(() => testdouble.reset());
		});
		describe('pass 2', () => {
			before(test_data_loader({
				"+": [ testdata1['+'][0] ]
			}));
			it('should keep stuff in memory if not deleted', () => {
				return ticks.load_ticks()
				.then(data => {
					// Use clone, so we safely can remove the updated property:
					ticks_data = Object.assign({}, ticks.data);
					// Dont include updated in comparison:
					delete ticks_data['+'][0]['updated'];
					delete ticks_data['+'][1]['updated'];

					expect(ticks_data['+']).to.deep.equal(testdata1['+']);
				});
			});
			after(() => testdouble.reset());
		});
		describe('pass 3', () => {
			before(test_data_loader({
				"-": [ testdata1['+'][1].id ]
			}));
			it('should delete ticks marked for deletion', () => {
				return ticks.load_ticks()
				.then(data => {
					expect(ticks.data['+']).to.deep.equal([ testdata1['+'][0] ]);
					expect(ticks.data['-']).to.deep.equal([ testdata1['+'][1].id ]);
				});
			});
			after(() => testdouble.reset());
		});
		describe('pass 4', () => {
			before(test_data_loader(testdata1));
			it('should remove ticks from deleted array if they are re-added', () => {
				return ticks.load_ticks()
				.then(data => {
					// Use clone, so we safely can remove the updated property:
					ticks_data = Object.assign({}, ticks.data);
					// Dont include updated in comparison:
					delete ticks_data['+'][0]['updated'];
					delete ticks_data['+'][1]['updated'];

					expect(ticks_data['+']).to.deep.equal(testdata1['+']);
					expect(ticks_data['-']).to.deep.equal([]);
				});
			});
			after(() => testdouble.reset());
		});
	});

	describe('now()', () => {
		const time = ticks.now();
		expect(typeof time).to.equal('number');
	});

	describe('normalize_tick()', () => {

		it('should make id into a string', () => {
			return ticks.normalize_tick({
				id: 5,
				content: "Hepp",
				time: 12345,
				important: false,
				updated: 12345
			})
			.then(tick => {
				expect(tick).to.deep.equal({
					id: "5",
					content: "Hepp",
					time: 12345,
					important: false,
					updated: 12345
				});
			});
		});

		it('should add updated field if it does not exist', () => {
			return ticks.normalize_tick({
				id: "5",
				content: "Hepp",
				time: 12345,
				important: false
			})
			.then(tick => {
				expect(tick).to.deep.equal({
					id: "5",
					content: "Hepp",
					time: 12345,
					important: false,
					updated: 12345
				});
			});
		});

	});

	describe('s3download()', () => {
	});

	describe('s3exists()', () => {
	});

	describe('s3upload()', () => {
	});

	describe('set_tick()', () => {
	});

	describe('set_updated_timestamp()', () => {
	});

	describe('sort_data()', () => {
	});

	describe('store_media()', () => {
	});

	describe('store_feeds()', () => {
	});

	describe('store_full_feed()', () => {
	});

	describe('store_partial_feeds()', () => {
	});

	describe('Updated property', () => {
		before(test_data_loader(testdata1));
		it('should be added if there is none', () => {
			return ticks.flush_data()
			.then(() => ticks.load_ticks())
			.then(() => {
				expect(typeof ticks.data['+'][0].updated).to.equal('number');
				expect(typeof ticks.data['+'][1].updated).to.equal('number');
			});
		});
		it('should not change when loading remote ticks', () => {
			testdata1['+'][0].updated = 123;
			testdata1['+'][1].updated = 456;
			return ticks.flush_data()
			.then(() => ticks.load_ticks())
			.then(() => {
				expect(ticks.data['+'][0].updated).to.equal(123);
				expect(ticks.data['+'][1].updated).to.equal(456);
			});
		});
		it('should not be updated if calling set_tick without changes', () => {
			return ticks.set_tick(
				testdata1['+'][0].id, 
				testdata1['+'][0].content, 
				testdata1['+'][0].time, 
				testdata1['+'][0].important 
			)
			.then(() => {
				expect(ticks.data['+'][0].updated).to.equal(123);
			});
		});
		it('should be updated if calling set_tick with changed content', () => {
			return ticks.set_tick(
				testdata1['+'][0].id, 
				testdata1['+'][0].content + 'test', 
				testdata1['+'][0].time, 
				testdata1['+'][0].important 
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
				testdata1['+'][0].id, 
				123
			)
			.then(() => {
				expect(ticks.data['+'][0].updated).to.equal(123);
			});
		});
		it('should be updated if calling set_tick with changed time', () => {
			return ticks.set_tick(
				testdata1['+'][0].id, 
				testdata1['+'][0].content, 
				testdata1['+'][0].time - 10, 
				testdata1['+'][0].important 
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
				testdata1['+'][0].id, 
				123
			).then(() => {
				return ticks.set_tick(
					testdata1['+'][1].id, 
					testdata1['+'][1].content, 
					testdata1['+'][1].time, 
					testdata1['+'][1].important = true
				)
			})
			.then(() => {
				expect(ticks.data['+'][0].updated).to.equal(123);
				expect(ticks.data['+'][1].updated).to.be.above(ticks.now() - 2);
			});
		});
		after(() => testdouble.reset());
	});

	describe('Partial feeds', () => {

		const test_feed_defs = [
			{
				"key": "/ticker/inital.json",
				"max_items": 10
			},
			{
				"key": "/tickers/latest.json",
				"max_age": 300
			}
		];

		let feeds, initialfeed, latestfeed;

		before(test_data_loader(testdata2));
		before(() => {
			ticks.get_partial_feed_definitions = testdouble.function();
			testdouble.when(ticks.get_partial_feed_definitions()).thenResolve(test_feed_defs);

			return ticks.flush_data()
			.then(() => ticks.load_ticks())
			.then(() => ticks.generate_partial_feeds())
			.then(f => feeds = f);
		})

		it('should generate the same number of feeds as there are feed definitions', () => {
			expect(feeds.length).to.equal(test_feed_defs.length);
		});
		it('should generate one feed for each key given', () => {
			initialfeed = feeds.filter(feed => feed.key === test_feed_defs[0].key);
			latestfeed = feeds.filter(feed => feed.key === test_feed_defs[1].key);
			expect(initialfeed.length).to.equal(1);
			expect(latestfeed.length).to.equal(1);
		});
		it('should generate a initial feed with right number of items', () => {
			expect(initialfeed[0].data['+'].length).to.equal(test_feed_defs[0].max_items);
		});
		it('should generate an empty latest feed, since everything is so old in the test data', () => {
			// An error here can be caused by updated-timestamp being set when
			// loading data.
			expect(latestfeed[0].data['+'].length).to.equal(0);
		});
		it('should generate non-empty latest feed if we change some stuff', () => {
			return ticks.get_ids()
			.then(ids => {
				return ticks.find_tick(ids[0]);
			})
			.then(tick => {
				return ticks.set_tick(tick.id, 'Testar', tick.time, tick.important, tick.media);
			})
			.then(() => ticks.generate_partial_feeds())
			.then(f => feeds = f)
			.then(() => {
				initialfeed = feeds.filter(feed => feed.key === test_feed_defs[0].key);
				latestfeed = feeds.filter(feed => feed.key === test_feed_defs[1].key);
			})
			.then(() => {
				expect(latestfeed[0].data['+'].length).to.equal(1);
			});
		});

	});

});
