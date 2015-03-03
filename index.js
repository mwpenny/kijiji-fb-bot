//index.js
/*A bot for checking recent Kijiji ads and notifying a group chat*/

var fs = require("fs");
var kijiji = require("kijiji-scraper");
var fb = require("facebook-chat-api");
var pkg = require("./package.json");

var chat = null;

var state = {
    "botProps": {},
    "adPrefs": {},
    "searchParams": {},
    "running": false,
    "scrapeTimer": null,
    "lastAds": [],
    "lastScrapeDate": new Date(0)
};

/*Scrapes for ads newer than the start date*/
var scrapeNewAds = function(startDate, callback) {
    console.log("[+] Scraping new ads...");

    //Search Kijiji
    kijiji.query(state.adPrefs, state.searchParams, function(err, ads) {    
        if (!err) {
            tmpAds = [];

            //Only add ads newer than the start date
            for (var i=0; i < ads.length; i++) {
                if (ads[i].hasOwnProperty("dc:date")) {
                    if (new Date(ads[i]["dc:date"]) > startDate) {
                        tmpAds.push(ads[i]);
                    }
                }
            }

            console.log("[+] " + tmpAds.length + " ads scraped");
            callback(err, tmpAds);
        } else {
            console.error("[-] Error scraping ads " + err);
            callback(err, null);
        }
    });
};

/*Sends a list of ads to the chat*/
var sendAdList = function(header, ads, thread, callback) {
    var output = "" + header;

    for (var i=0; i < ads.length; i++) {
        output += kijiji.parse(ads[i]) + "\r\n";
    }
    chat.sendMessage(output, thread, callback);
};

/*Searches Kijiji for matching recent ads sends them to the given FB chat thread*/
var sendNewAds = function(thread, callback) {
    console.log("[+] Sending recent ads...");
    chat.sendMessage("One moment...", thread, callback); //this could take a while
    
    scrapeNewAds(state.lastScrapeDate, function(err, ads) {
        if (!err) {
            state.lastAds = ads;
            state.lastScrapeDate = new Date();
            
            var header = "~~~ " + state.lastAds.length + " ad(s) since last scrape ~~~\r\n";            
            sendAdList(header, state.lastAds, thread);
        } else {
            chat.sendMessage("Error scraping ads (see console)", thread, callback);
        }
    });
};

/*Sends bot state info to the chat*/
var sendInfo = function(thread, callback) {
    console.log("[+] Sending info...");

    var info = "~~~ kijiji-fb-bot v" + pkg.version + " ~~~\r\n" +
               "Last scrape: " + state.lastScrapeDate + "\r\n" +
               "Ads found at last scrape: " + state.lastAds.length + "\r\n";
    
    //Add bot properties to output
    info += "\r\n~~~ bot properties ~~~\r\n";
    for (var prop in state.botProps) {
        if (state.botProps.hasOwnProperty(prop)) {
            info += prop + ": " + state.botProps[prop] + "\r\n";
        }
    }

    //Add ad preferences to output
    info += "\r\n~~~ ad preferences ~~~\r\n";
    for (var prop in state.adPrefs) {
        if (state.adPrefs.hasOwnProperty(prop)) {
            info += prop + ": " + state.adPrefs[prop] + "\r\n";
        }
    }

    //Add search parameters to output
    info += "\r\n~~~ search parameters ~~~\r\n";
    for (var prop in state.searchParams) {
        if (state.searchParams.hasOwnProperty(prop)) {
            info += prop + ": " + state.searchParams[prop] + "\r\n";
        }
    }

    chat.sendMessage(info, thread, callback);
};

/*Sends a help/syntax message*/
var sendHelp = function(thread, callback) {
    console.log("[+] Sending help...");

    var help = "Hi, I'm " + state.botProps.name + ": the helpful ad-scraping robot!\r\n" +
               "I have a have a few useful commands you can use.\r\n" +
               "Prefix a command with my name, so I know you're talking to me.\r\n\r\n" +
               "Commands:\r\n" +
               "\tlist\t\t\t\t\tGets a list of the last scraped ads.\r\n" +
               "\tscrape\t\t\t\tGets ads posted since the last scrape.\r\n" +
               "\tinfo\t\t\t\t\tGets bot state information.\r\n";

    //Only show property-changing commands if they're allowed
    if (state.botProps.remoteAdmin) {
        help += "\tbotprop [prop] [val]\t\tGets/sets a bot property.\r\n" +
                "\tadpref [pref] [val]\t\t\tGets/sets an ad search preference.\r\n" +
                "\tsearchparam [param] [val]\tGets/sets an ad search parameter.\r\n";
    }

    help += "\thelp\t\t\t\t\tDisplays this help information.";

    chat.sendMessage(help, thread, callback);
};

/*Gets/sets a property of an object*/
var modProp = function(propObj, prop, val, thread, callback) {
    var response;

    //Prop not valid
    if (!propObj.hasOwnProperty(prop)) {
        response = "Property '" + prop + "' not found";
    }
    //No value to set -- return the current value
    else if (!val) {
        response = "Value of property '" + prop + "' is '" + propObj[prop] + "'";
    }
    //Set a new value
    else {
        console.log("[+] Sending property value...");

        var newVal = propObj[prop].constructor(val); //want new val to be same type as old
        response = "Value of property '" + prop + "' changed to '" + newVal + "'";
        propObj[prop] = newVal;
        
        //Update the scrape timer if the interval was changed
        if (prop === "scrapeInterval")
            updateInterval(state.scrapeTimer, scheduledScrape, state.botProps.scrapeInterval);
    }

    chat.sendMessage(response, thread, callback);
}

/*Sends an error for a wrong command*/
var sendUnknownCommand = function(command, thread, callback) {
    chat.sendMessage("Unknown command '" + command + "'", thread, callback);
};

/*Updates an interval with a new timeout*/
var updateInterval = function(interval, func, timeout) {
    clearInterval(interval);
    interval = timeout >= 0 ? setInterval(func, timeout) : null;
};

/*The function called every scrape interval*/
var scheduledScrape = function() {
    chat.sendMessage("Performing scheduled scrape...", state.botProps.chatId);
    sendNewAds(state.botProps.chatId);
    updateInterval(state.scrapeTimer, scheduledScrape, state.botProps.scrapeInterval);
};

/*Listens for bot commands*/
var chatListener = function(err, msg, stopListening) {
    if (err) return console.error(err);
    if (!state.running) return stopListening();
    
    //Commands must start with the bot's name
    if (msg.body.indexOf(state.botProps.name + " ") === 0) {
        var query = msg.body.split(state.botProps.name + " ")[1].split(" ");    
        var command = query[0];
        var args = query.slice(1, query.length).join(" ");

        /*Command handlers*/

        //Only check for property-changing commands if they're allowed
        if (state.botProps.remoteAdmin) {
            var argArr = args.split(" ");
            var prop = argArr[0];
            var val = argArr.slice(1, argArr.length).join(" ");

            if (command === "botprop")
                return modProp(state.botProps, prop, val, msg.thread_id);
            else if (command === "adpref")
                return modProp(state.adPrefs, prop, val, msg.thread_id);
            else if (command === "searchparam")
                return modProp(state.searchParams, prop, val, msg.thread_id);
        }

        if (command === "list")
            sendAdList("~~~ last ad(s) scraped (" + state.lastAds.length + ") ~~~\r\n",
                       state.lastAds, msg.thread_id);
        else if (command === "scrape")
            sendNewAds(msg.thread_id);  
        else if (command === "info")
            sendInfo(msg.thread_id);
        else if (command === "help")
            sendHelp(msg.thread_id);
        else
            sendUnknownCommand(command, msg.thread_id);
    }
}

/*Sets the bot to stop after the next message is received*/
var stop = function() {
    state.running = false;
    clearInterval(state.scrapeTimer);
    console.log("[+] " + state.botProps.name + " set to stop");
}

/*Initializes the bot*/
var init = function(configDir, callback) {
    console.log("[+] Initializing bot...");

    //Load preferences
    state.botProps = JSON.parse(fs.readFileSync(configDir + "/botprops.json"));
    state.adPrefs = JSON.parse(fs.readFileSync(configDir + "/adprefs.json"));
    state.searchParams = JSON.parse(fs.readFileSync(configDir + "/searchparams.json"));

    state.running = true;

    //Start listening in the chat
    fb(configDir + "/facebook.json", function(err, api) {
        if (err) {
            state.running = false;
            console.error("[-] Error starting bot " + err);
            return callback(err, null);
        }
        api.listen(chatListener);
        
        chat = api;
        console.log("[+] " + state.botProps.name + " is listening");
        
        if (state.botProps.hasOwnProperty("scrapeInterval") && state.botProps.scrapeInterval >= 0)
            state.scrapeTimer = setInterval(scheduledScrape, state.botProps.scrapeInterval);
        
        callback(null, stop);
    });
};

module.exports = init;
