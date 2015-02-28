# kijiji-fb-bot
A node.js bot that scrapes recent [Kijiji](http://www.kijiji.ca) ads and sends them in a Facebook message.


### Features
* Automatically receive new Kijiji ads matching given search criteria
* Send commands to the bot to manually retrieve ads

### Dependencies
* [node.js](http://github.com/joyent/node) - evented I/O for the backend
* [kijiji-scraper](http://github.com/mwpenny/kijiji-scraper) - Kijiji ad scraper
* [facebook-chat-api](http://github.com/Schmavery/facebook-chat-api) - unofficial Facebook chat API for node.js

### Installation
`npm install kijiji-fb-bot`

### Configuration
You can configure the bot by placing the following JSON files in a configuration directory:

* `botprops.json` - Contains basic bot properties:
```js
 {
    "name": "bot name (used for chat commands)",
    "chatId": <chat id to send automatic updates>,
    "scrapeInterval": <frequency of scrapes (in ms)>
 }
```

* `facebook.json` - Contains the Facebook credentials the bot will use to log in:
```js
{
    "email": "Facebook account email",
    "password": "Facebook account password"
}
```

* `adprefs.json` - Contains the Kijiji ad search category and location. See [the `prefs` argument for kijiji-scraper's query() function](http://github.com/mwpenny/kijiji-scraper#queryprefs-params-callback).

* `searchparams.json` - Contains the Kijiji ad search criteria. See [the `params` argument for kijiji-scraper's query() function](http://github.com/mwpenny/kijiji-scraper#queryprefs-params-callback).

### Documentation

#### init(configDir, callback)
Will call `callback` with a function to stop the bot.
##### Arguments
* `configDir` - The directory containing the bot's configuration files.

* `callback(err, stop)` - A callback called after the bot has been started. If there is an error, `err` will not be null. If everything was successful, `stop` will be a function that, when called, sets the bot to stop after the next chat message is received. It cannot be stopped immediately as a result of a limitation of the facebook-chat-api module.

##### Example usage
```js
var bot = require("kijiji-fb-notifier");

bot("json/botconfig", function(err, stop) {
    //The bot will work its magic
    //Call stop() when done
});
```
---
#### Chat commands
The bot can be interacted with by sending it Facebook messages. Each command must be prefixed with the bot name specified in `botprops.json`. The following commands are supported:

* `list` - The bot will reply with a list of the last scraped ads.
* `scrape` - The bot will scrape and reply with ads posted to Kijiji since the last scrape.
* `info` - The bot will reply with information about its state.
* `help` - The bot will reply with information about its chat commands.

##### Example usage
`[BOTNAME] [COMMAND]`
