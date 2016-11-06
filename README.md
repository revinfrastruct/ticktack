# ticktack

This is a command line back-end for Live Ticker feeds.

It will publish a couple of JSON files with your feed data, and it will
push messages to a message queue when something is updated.

Currently, ticktack supports Amazon S3 for publishing/storing JSON files,
and Amazon SNS for push notifications on any updates.

## Prerequisites

### 1. Install nodejs dependencies

	$ npm install

### 2. Set AWS credentials

Just as `aws-cli`, this script depends on a credentials file at
`~/.aws/credentials`. It should look something like this:

	[default]
	aws_access_key_id = <your access key id>
	aws_secret_access_key = <your secret access key>


### 3. Create a configuration for this script.

Create a `config.json` in the `ticktack` directory. It should look something
like this:

	{
		"s3": {
			"bucket": "<the bucket you use>",
			"region": "<the aws region you use>",
			"path": "/some/path/ticker.json"
		}
	}

## How to use

### Add or update a ticker message

This will add a message with ID `5`:

	$ echo "This is a message." | ticktack set 5

To update the same message:

	$ echo "This is an updated message." | ticktack set 5

To set/update both message content and the timestamp:

	$ echo "This is a message." | ticktack set --time 1478383914 5

### To display your live ticker messages

	$ ticktack list

### Delete a ticker message

This will remove the message with ID `5`:

	$ ticktack del 5

## A couple of design principles and comments:

* This was built to be the back-end for a live ticker feed. It was not built
for very large feeds. Each time anything changes in the feed, all data in the
entire feed will be downloaded and then uploaded again. Keep that in mind when
making your technology choices.
* The concurrency control is not great. Try to not run multiple instances
updating the same feed at the same time.
* The ID for a single message is just some string. In the examples above, it is
the number `5`, however it can really be any string. It just have to be unique
for each message.

