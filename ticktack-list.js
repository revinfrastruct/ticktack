const commandline = require('commander');
const ticks = require('./src/ticks');

commandline
.usage('')
.description('List all ticker messages.')
.parse(process.argv);

if (commandline.args.length > 0) {
	console.error('Too many arguments.');
	process.exit(1);
}

ticks.init()
.then(() => ticks.load_ticks())
.then(() => {
	console.log(JSON.stringify(ticks.data));
});
