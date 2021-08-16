/*
	Discord bridge: discord -> gameserver
*/

"use strict";

const Discord = require('discord.js');
const http2byond = require('http2byond');

const config = require('./config.json');

const client = new Discord.Client({
	intents: [Discord.Intents.FLAGS.GUILDS, Discord.Intents.FLAGS.GUILD_MESSAGES]
});
const byondClient = new http2byond({
	timeout: 2000
});

const discordToken = process.env.DISCORD_TOKEN;
const byondPort = process.env.DD_PORT;
const byondSecret = process.env.BRIDGE_SECRET;

let mainGuildID;

console.log(config);

client.login(discordToken);

client.on('ready', async () => {
	mainGuildID = await client.guilds.cache.get(config["server-id"]);
	console.log("Ready");
});

client.on('messageCreate', async message => {
	if (message.author.bot || message.channel.type === 'dm') {
		return;
	}

	if(message.guild.id !== config["server-id"]) {
		return;
	}

	let args = message.content.split(" ");

	if (args.length < 2) {
		return;
	}

	// first arg is bot mention
	if (args[0] !== "<@!"+client.user.id+">" && args[0] !== "<@"+client.user.id+">") {
		return;
	}

	// second arg is command, check if command exists and user has permissions for command
	let commandType = args[1].toLowerCase();
	let commandConfig = config["commands"][commandType];

	if (!commandConfig) {
		return;
	}

	if (!commandConfig["groups"].length || !message.member.roles.cache.hasAny(...commandConfig["groups"])) {
		return;
	}

	// check if we have all arguments for command
	let commandArgs = args.slice(2); // first two is @mention and command

	if (commandArgs.length < commandConfig["arguments"]) {
		return;
	}

	// need to check if user name is acceptable
	// todo: in the future we can use HoP bot DB to get trusted nicknames
	let byondCkey = ckey(message.member.displayName);

	if (!byondCkey) {
		return;
	}

	// now we can form and send byond topic
	let topicConfig = {
		ip: "localhost",
		port: byondPort
	};

	topicConfig.topic = "?bridge";
	topicConfig.topic += "&bridge_secret=" + byondSecret;
	topicConfig.topic += "&bridge_type=" + commandType;
	topicConfig.topic += "&bridge_from_uid=" + message.member.id;
	topicConfig.topic += "&bridge_from_user=" + byondCkey;
	topicConfig.topic += "&bridge_from_suffix=Discord";

	//let argsMin = commandConfig["arguments"];
	let argsMax = commandConfig["arguments"] + (commandConfig["optional-arguments"] || 0);

	// todo: this part maybe complicated and need rewrite
	// tl;rd args looks lile:
	// @Botmention command arg1...arg(N-1) argN
	// where last argN is: regular arg OR optional arg OR open-ended argument

	if (argsMax > 0 && commandArgs.length) {
		// setup arguments exept last
		for (var i = 0; i < (argsMax - 1); i++) {
			topicConfig.topic += `&bridge_arg_${i+1}=${commandArgs[i]}`;
		}
	
		// last argument is always open-ended and can be optional
		let lastArg = commandArgs.slice(argsMax-1);
		if(lastArg.length) {
			let openArg = encodeURI(lastArg.join(" "));
			topicConfig.topic += `&bridge_arg_${argsMax}=${openArg}`;
		}
	}
	
	console.log(topicConfig.topic);
	
	try {
		let result = await byondClient.run(topicConfig);
		console.log(result);
		return result;
	} catch (e) {
		console.error("ERR", e);
		return message.reply("Game server is not available or under heavy load for some reason.");
	}

});

function ckey(name) {
	return name.replace(/[^A-Za-z]/g, "").toLowerCase();
}
