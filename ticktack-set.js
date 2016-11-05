const commandline = require('commander');

commandline
.usage('[options] <id>')
.description('This command will add or update a ticker message.')
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
