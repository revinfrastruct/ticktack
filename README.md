# ticktack

## Command-line tool for updating ticker messages

### Prerequisites

#### 1. Install nodejs dependencies

		$ npm install

#### 2. Set AWS credentials

Just as `aws-cli`, this script depends on a credentials file at
`~/.aws/credentials`. It should look something like this:

		[default]
		aws_access_key_id = <your access key id>
		aws_secret_access_key = <your secret access key>


#### 3. Create a configuration for this script.

Create a `config.json` in the `ticktack` directory. It should look something
like this:

		{
		  "aws": {
			"bucket": "<the bucket you use>",
			"region": "<the aws region you use>"
		  },
		  "ticker": {
			"name": "<unique string identifying the ticker>"
		  }
		}

