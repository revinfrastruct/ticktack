const commandline = require('commander');

const package_json = require('./package.json'); // Included to get version nr.
const version = package_json.version;

commandline
.version(version)
.command('del <id>', 'Delete a tick message.')
.command('list', 'List all ticker messages.')
.command('set [options] <id>', 'Add or update a tick message. Message content should be piped.')
.parse(process.argv);


