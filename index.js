//index.js
/*A bot for checking recent Kijiji ads and notifying a group chat*/

var fs = require("fs");
var kijiji = require("kijiji-scraper");
var fb = require("facebook-chat-api");

var state = {
    "botProps": {},
    "adPrefs": {},
    "searchParams": {},
    "chat": null,
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
            console.log("[-] Error scraping ads " + err);
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
            
            var header = "~~~ " + state.lastAds.length + " ads since last scrape ~~~\r\n";            
            sendAdList(header, state.lastAds, thread);
        } else {
            chat.sendMessage("Error scraping ads (see console)", thread, callback);
        }
    });
};

/*Sends bot state info to the chat*/
var sendInfo = function(thread, callback) {
    console.log("[+] Sending info...");

    //Send vars to chat
    var info = "~~~ " + state.botProps.name + " ~~~\r\n" + 
               "Scrape interval: " + state.botProps.scrapeInterval + "ms\r\n" +
               "Last scrape: " + state.lastScrapeDate + "\r\n" +
               "Ads found at last scrape: " + state.lastAds.length + "\r\n";
    
    info += "\r\n~~~ search parameters ~~~\r\n";
    for (var pref in state.adPrefs) {
        if (state.adPrefs.hasOwnProperty(pref))
            info += pref + ": " + state.adPrefs[pref] + "\r\n";
    }
               
    for (var param in state.searchParams) {
        if (state.searchParams.hasOwnProperty(param))
            info += param + ": " + state.searchParams[param] + "\r\n";
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
               "\tlist\t\tRetrieves a list of the last scraped ads.\r\n" +
               "\tscrape\tRetrieves ads posted since the last scrape.\r\n" +
               "\tinfo\t\tDisplays some basic state information.\r\n" +
               "\thelp\t\tDisplays this help information.";

    chat.sendMessage(help, thread, callback);
};

/*Sends an error for a wrong command*/
var sendUnknownCommand = function(command, thread, callback) {
    chat.sendMessage("unknown command '" + command + "'", thread, callback);
};

/*The function called every scrape interval*/
var scheduledScrape = function() {
    chat.sendMessage("Performing scheduled scrape...", state.botProps.chatId);
    sendNewAds(state.botProps.chatId);
};

/*Listens for bot commands*/
var chatListener = function(err, msg, stopListening) {
    if (err) return console.error(err);
    if (!state.running) return stopListening();
    
    if (msg.body.indexOf(state.botProps.name + " ") === 0) {
        var query = msg.body.split(state.botProps.name + " ")[1].split(" ");
        
        var command = query[0];
        var args = query.slice(1, query.length).join(" ");
        
        //Command handlers
        if (command === "list")
            sendAdList("~~~ last ads scraped (" + state.lastAds.length + ") ~~~\r\n",
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
    console.log("[+] " + state.botProps.name + " stopped");
}

/*Initializes the bot*/
var init = function(configDir, callback) {
    console.log("[+] Initializing bot...");

    //Load preferences
    state.botProps = JSON.parse(fs.readFileSync(configDir + "/botprops.json", 'utf8'));
    state.adPrefs = JSON.parse(fs.readFileSync(configDir + "/adprefs.json", 'utf8'));
    state.searchParams = JSON.parse(fs.readFileSync(configDir + "/searchparams.json", 'utf8'));

    state.running = true;

    //Start listening in the chat
    fb(configDir + "/facebook.json", function(err, api) {
        if (err) return callback(err, null);
        api.listen(chatListener);
        
        chat = api;
        console.log("[+] " + state.botProps.name + " is listening");
        
        if (state.botProps.hasOwnProperty("scrapeInterval") && state.botProps.scrapeInterval >= 0)
            state.scrapeTimer = setInterval(scheduledScrape, state.botProps.scrapeInterval);        
        
        callback(null, stop);
    });
};

module.exports = init;
