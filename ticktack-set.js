const commandline = require('commander');
const get_stdin = require('get-stdin');
const ticks = require('./src/ticks');

commandline
.usage('[options] <id>')
.description('This command will add or update a ticker message.')
.option('-i, --important', 'Mark this message as important.')
.option('-m, --media [file]', 'Attach image to tick.')
.option('-t, --time [epoch]', 'Set timestamp for the tick.')
.parse(process.argv);

if (commandline.args.length < 1) {
	console.error('One id argument is required.');
	process.exit(1);
}

if (commandline.args.length > 1) {
	console.error('Too many arguments.');
	process.exit(1);
}

ticks.init()
.then(() => ticks.load_ticks())
.then(() => get_stdin())
.then(content => ticks.set_tick(commandline.args[0], content, commandline.time, commandline.important ? true : false, commandline.media))
.then(() => ticks.store_feeds())
.catch(err => {
	console.error(err);
	process.exit(1);
});
