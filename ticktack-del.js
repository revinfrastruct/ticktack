const commandline = require('commander');
const ticks = require('./src/ticks');

commandline
.usage('[id]')
.description('Delete a ticker message.')
.parse(process.argv);

if (commandline.args.length < 0) {
	console.error('Too few arguments.');
	process.exit(1);
}

if (commandline.args.length > 1) {
	console.error('Too many arguments.');
	process.exit(1);
}

ticks.init()
.then(() => ticks.load_ticks())
.then(() => ticks.delete_tick(commandline.args[0]))
.then(() => ticks.store_ticks())
.catch(err => {
	console.error(err);
	process.exit(1);
});
