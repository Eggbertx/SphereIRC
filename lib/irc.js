/*
 * SphereIRC 0.1.2019-04-10
 * Copyright (c) 2019, Eggbertx
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1 Redistributions of source code must retain the above copyright notice, this
 *   list of conditions and the following disclaimer.
 *
 * 2 Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 *
 * 3 Neither the name of SphereIRC nor the names of its contributors may be used
 *   to endorse or promote products derived from this software without specific
 *   prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

import { Thread } from 'sphere-runtime';

let encoder = new TextEncoder();
let decoder = new TextDecoder();
const userMatchrRegexp = /:?(.+)!(.+)/;
const actionMatchRegexp = /\u0001ACTION (.+)\u0001/;
const versionString = "0.1";

export class IRCClient extends Thread {
	/** for CTCP VERSION string, semi-required by some IRC networks, e.g. freenode */
	get version() {
		return `SphereIRC ${versionString} / ${Sphere.Engine}`;
	}

	constructor(options = {}, console) {
		super();
		this.console = console;
		if(!checkString(options.nick, 1)
		|| !checkString(options.username, 1)
		|| !checkString(options.password, 1)) {
			throw new ReferenceError("Object passed to IRCClient must have nick, username, and password strings");
		}

		this.nick = options.nick;
		this.username = options.username;
		this.password = options.password;
		this.realName = checkString(options.realName, 1)?options.realName:"";
		this.quitMessage = checkString(options.quitMessage, 1)?options.quitMessage:"Quit";
		this.partMessage = checkString(options.partMessage, 1)?options.partMessage:"Leaving";

		this.servers = [];
		if(options.servers instanceof Array) {
			for(let server of options.servers) {
				let _server = {};
				if(!checkString(server.hostname, 1)) throw new Error(`Invalid server host: ${server.host}`);
				_server.hostname = server.hostname;
				_server.port = server.port?server.port:6667;
				_server.startChannels = [];
				if(server.channels) {
					for(let channel of server.channels) {
						let ch = validateChannel(channel);
						if(ch != "") _server.startChannels.push(ch);
					}
				}
				_server.joinedChannels = []; // only populated after the JOIN server RPL is received
				_server.nick = checkString(server.nick, 1)?server.nick:this.nick;
				_server.username = checkString(server.username, 1)?server.username:this.username;
				_server.password = checkString(server.password, 1)?server.password:this.password;
				_server.realName = checkString(server.realName, 1)?server.realName:this.realName;
				_server.quitMessage = checkString(server.quitMessage, 1)?server.quitMessage:this.quitMessage;
				_server.partMessage = checkString(server.partMessage, 1)?server.partMessage:this.partMessage;
				_server.socket = new Socket();
				_server.eventHandlers = [];
				this.servers.push(_server);
			}
		}
		this.eventActions = [];
	}

	connect() {
		for(let server of this.servers) {
			this.log(server, null, `Attempting connection to ${server.hostname}:${server.port}`);
			server.socket.connectTo(server.hostname, server.port).then((val) => {
				this.log(server, null, `Connected successfully.`);
				this.sendRawLine(server, `PASS ${server.password}`);
				this.sendRawLine(server, `NICK ${server.nick}`);
				this.sendRawLine(server, `USER ${server.username} 8 * :${server.realName}`);
			});
		}
	}

	getServer(hostname) {
		for(let server of this.servers) {
			if(server.hostname = hostname)
				return server;
		}
		return null;
	}

	sendMessage(server, channel, message) {
		this.sendRawLine(server, `PRIVMSG ${channel} :${message}`);
	}

	addEventHandler(hostname, event, cb, override) {
		if(hostname == "*") {
			for(let server of this.servers) {
				server.eventHandlers.push({
					event: event,
					callback: cb,
					override: (override == true)
				});
			}
		} else {
			let server = this.getServer(hostname);
			if(!server) {
				throw new ReferenceError(`${hostname} is not a registered IRC server.`);
			}
			server.eventHandlers.push({
				event: event,
				callback: cb,
				override: override == true
			});
		}
	}

	log(server, channel, line) {
		if(server == "*") {
			for(let s of this.servers) {
				this.log(s, channel, line);
			}
		}
		let channelName = channel?`[${channel}]`:"";
		this.console.log(server.hostname + channelName + ": " + line);
	}

	parseLine(server, line) {
		if(!server.socket.connected || line == "") return;
		if(line.indexOf("PING") == 0) {
			this.sendRawLine(server,line.replace("PING","PONG"));
			return
		}
		this.console.log(line);
		let arr = line.split(" ");
		let msgType = arr[1];

		for(let handler of server.eventHandlers) {
			if(handler.event == msgType) {}
		}
		switch(msgType) {
			// 001-005, 251-255, and 375-376 means we're officially connected and ready to go
			case IRCEvent.SrvWelcome: // Server welcome
			case IRCEvent.YourHost: // Your host is...
			case IRCEvent.SrvCreatedDate: // This server was created...
			case IRCEvent.SrvVersion: // Server version
			case IRCEvent.SrvBounce: // Server bounce
			case IRCEvent.SrvNumUsers: // There are # users and # invisible on # servers 
			case IRCEvent.SrvNumOps: // Number of operators
			case IRCEvent.SrvNumUnknownConns: // Number of unknown connections
			case IRCEvent.SrvNumChannels: // Number of channels
			case IRCEvent.SrvNumClients: // I have # clients and # servers
			case IRCEvent.MOTDStart: // MOTD start
			case IRCEvent.MOTDEnd: // MOTD end
				this.sendRawLine(server, `JOIN ${server.startChannels.join(",")}`);
				break;
			case IRCEvent.Topic: // channel topic
				let channel = arr[3];
				let topic = arr.slice(4).join(" ").slice(1);
				this.log(server, null, `Topic for ${channel}: ${topic}`);
				break;
			case IRCEvent.TopicTimestamp: // channel topic set date/time
				channel = arr[3];
				let setter = arr[4];
				let timeSet = new Date(arr[5]*1000);
				this.log(server, null, `Topic for ${channel} set by ${setter} on ${timeSet}`);
				break;
			case IRCEvent.UsersInChannel: // reply to /names
				this.log(server,null,`Users in ${server.hostname}[${arr[4]}]: ${arr.slice(5).join(", ").slice(1)}`)
				break;
			case IRCEvent.YourID: // your ID
			case IRCEvent.SrvLocalUsers: // local users
			case IRCEvent.SrvGlobalUsers: // global users
			case IRCEvent.EndOfNames: // end of /names
			case IRCEvent.YourDisplayedHost: // your visible host
				break;
			case IRCEvent.MOTD: // MOTD
				this.log(server,null,arr.slice(3).join(" ").slice(1));
				break;
			case IRCEvent.UserJoined:
				let ch = arr[2].slice(1).trim();
				this.log(server,ch,`Joined ${ch}`);
				server.joinedChannels.push(ch);
				break;
			case IRCEvent.UserKicked:
				this.log(server, arr[2], arr[3] + " was kicked from the channel.");
				if(arr[3] == server.nick) {
					for(let i in server.joinedChannels) {
						if(server.joinedChannels[i] == arr[2]) {
							server.joinedChannels.splice(i,1);
							break;
						}
					}
				}
				break;
			case IRCEvent.ModeSet:
				setter = arr[0].split("!")[0].slice(1);
				let moded = arr[2];
				let mode = arr[3];
				this.log(server,null,`${setter} sets mode ${mode} on ${moded}`);
				break;
			case IRCEvent.Notice:
			case IRCEvent.Message:
				let dest = arr[2];
				let msg = arr.slice(3).join(" ").slice(1);
				let userMatch = arr[0].match(userMatchrRegexp);
				let actionMatch = msg.match(actionMatchRegexp);
				if(!userMatch) break; // this shouldn't happen unless there's a serious issue with the connection
				if(userMatch[1] == server.nick) break;
				if(dest[0] == '#') {
					if(actionMatch != null)
						this.log(server, dest, userMatch[1] + actionMatch[1]);
					else
						this.log(server, dest, userMatch[1] + ": " + msg);
				} else if(msgType == "PRIVMSG" && msg == "\u0001VERSION\u0001") {
					this.log(server,null,`Received a CTCP VERSION from ${dest}`);
					this.sendRawLine(server, `PRIVMSG ${dest} :\u0001VERSION ${this.version}\u0001`);
				} else {
					// private message
					this.log(server, userMatch[1], msg);
				}
				break;
			default:
				this.log(server,null,line);
				break;
		}
	}

	sendRawLine(server, line) {
		server.socket.write(encoder.encode(line + "\n"));
	}

	disconnect() {
		for(let server of this.servers) {
			if(!server.socket.connected) continue;
			this.log(server, null, `Disconnecting from ${server.hostname}:${server.port}`);
			// this.sendRawLine(server, `PART ${server.startChannels.join(",")} ${server.partMessage}`);
			this.sendRawLine(server, `QUIT ${server.quitMessage}`);
			server.socket.close();
		}
	}

	on_update() {
		for(let server of this.servers) {
			let available = server.socket.bytesAvailable;
			if(available > 0) {
				let str = decoder.decode(server.socket.read(available));
				let strArr = str.split("\n");
				for(let line of strArr) {
					this.parseLine(server, line.trim());
				}
			}
		}
	}
}

/**
 * These IRC events are used for handling callbacks and parsing raw TCP strings.
 * The numeric events are of the form `:<server> ### <important stuff>`.
 * Most string events (PRIVMSG,ACTION,NOTICE,etc) are of the form `:<sender> <event> :<etc>` 
 * See the following for more info.
 * 
 * https://defs.ircdocs.horse/defs/numerics.html
 * 
 * https://tools.ietf.org/html/rfc1459
 */
export let IRCEvent = {
	/**
	 * Used for unimplemented or unknown events (no value)
	 */
	UnknownEvent: null,
	/**
	 * Server welcome message
	 * @param {string} "001"
	 * @example ":<server> 001 <client> :Hello SphereBot!"
	 */
	SrvWelcome: "001",
	/**
	 * Tells the client what its host (according to the server) is
	 * @param {string} "002"
	 * @example ":<server> 001 <client> :Your host is <host>, running version <version>"
	 */
	YourHost: "002",
	/**
	 * Shows when the server was created
	 * @param {string} "003"
	 * @example ":<server> 003 <client> :This server was created 00:00:00 Jan 01 1970"
	 */
	SrvCreatedDate: "003",
	/**
	 * Shows the server's version information
	 * @param {string} "004"
	 * @example
	 * ":<server> 004 <client> <host> InspIRCd-2.0 <usermodes> <channelmodes> <channelmodes_with_parameter>"
	 */
	SrvVersion: "004",
	/**
	 * @param {string} "005"
	 */
	SrvBounce: "005",
	/**
	 * A unique ID assigned to each client
	 * @param {string} "042"
	 * @example ":<server> 042 <client> <id> :your unique ID"
	 */
	YourID: "042",
	/**
	 * Reply to LUSERS command showing number of users connected to the IRC network
	 * @param {string} "251"
	 * @example
	 * ":<server> 251 <client> :There are # users and # invisible on # servers"
	 */
	SrvNumUsers: "251",
	/**
	 * Reply to LUSERS command showing number of online operators
	 * @param {string} "252"
	 * @example
	 * ":<server> 252 <client> # :operator(s) online"
	 */
	SrvNumOps: "252",
	/**
	 * Shows the reply to the LUSERS command showing number of unknown connections
	 * @param {string} "253"
	 * @example
	 * ":<server> 253 <client> # :unknown connection(s)"
	 */
	SrvNumUnknownConns: "253",
	/**
	 * Shows the reply to the channels request
	 * @param {string} "254"
	 * @example ":<server> 254 <client> # :channels formed"
	 */
	SrvNumChannels: "254",
	/**
	 * Reply to LUSERS, shows the numberof clients and servers (text may vary)
	 * @param {string} "255"
	 * @example ":<server> 255 <client> :I have # clients and # servers"
	 */
	SrvNumClients: "255",
	/**
	 * Shows the current number of local clients connected to the server and max number
	 * that have been connected at one time. Exact text may vary
	 * @param {string} "265"
	 * @todo Account for possible differences
	 * @example
	 * ":<server> 265 <client> :Current Local Users: #  Max: #"
	 */
	SrvLocalUsers: "265",
	/**
	 * Shows the current number of global clients connected to the network and max number
	 * that have been connected at one time
	 * @param {string} "266"
	 * :<server> 266 <client> :Current Global Users: #  Max: #
	 */
	SrvGlobalUsers: "266",
	/**
	 * Response to a channel topic request
	 * @param {string} "332"
	 * @example ":<server> 332 <client> <channel> :<topic string>"
	 */
	Topic: "332",
	/**
	 * Shows when the topic was changed
	 * @param {string} "333"
	 * @example
	 * ":<server> 333 <client> <channel> <changer> <timestamp>"
	 */
	TopicTimestamp: "333",
	/**
	 * Shows the users in the requested channel
	 * @param {string} "353"
	 * @example ":<server> 353 <client> = #bots :<mode><nick1> <mode><nick2> ..."
	 */
	UsersInChannel: "353",
	/**
	 * Signals the end of the /NAMES list
	 * @param {string} "366"
	 * @example ":<server> 366 <client> <channel> :End of /NAMES list."
	 */
	EndOfNames: "366",
	/**
	 * Shows the server's Message Of The Day
	 * @param {string} "372"
	 * @example ":<server> 372 <client> :- <motd string>"
	 */
	MOTD: "372",
	/**
	 * Signals the start of the MOTD
	 * @param {string} "375"
	 * @example ":<server> 375 <client> :<host> message of the day"
	 */
	MOTDStart: "375",
	/**
	 * Signals the end of the MOTD
	 * @param {string} "376"
	 * @example ":<server> 376 <client> :End of message of the day."
	 */
	MOTDEnd: "376",
	/**
	 * Shows what others see as our hostname
	 * @param {string} "396"
	 * @example
	 * ":<server> 396 <client> <hostname> :is now your displayed host"
	 */
	YourDisplayedHost: "396",
	/**
	 * Reports when a user joins a channel we are in
	 * @param {string} "JOIN"
	 * @example ":<nick>!<username>@<hostname> JOIN :<channel>"
	 */
	UserJoined: "JOIN",
	/**
	 * Reports when a user is kicked from a channel
	 * @param {string} "KICK"
	 * @example
	 * ":<kickernick>!<kicker_username>[at]<kicker_hostname> KICK <channel> <kicked_nick> :<kickernick"
	 */
	UserKicked: "KICK",
	/**
	 * Reports when mode is set on a user
	 * @param {string} "MODE"
	 * @example
	 * ":<nick>!<username>[at]<hostname> MODE <channel> <modechange> <other parameters>"
	 */
	ModeSet: "MODE",
	/**
	 * Reports when we receive a notice message. These must not be automatically replied to
	 * @param {string} "NOTICE"
	 * @example
	 * ":<server> NOTICE Auth :*** Looking up your hostname..."
	 * @example
	 * ":<nick>!<username>[at]<hostname> NOTICE <ournick> :<notice message>"
	 */
	Notice: "NOTICE",
	/**
	 * Reports when a user sends a message, whether in a channel or a private message
	 * @param {string} "PRIVMSG"
	 * @example
	 * ":<nick>!<username>[at]<hostname> PRIVMSG <channel :<message string>"
	 * @example 
	 * ":<nick>!<username>[at]<hostname> PRIVMSG <ournick> :<private message to us>"
	 */
	Message: "PRIVMSG",
	/**
	 * Reports when a user parts (leaves a channel but doesn't log out)
	 * @param {string} "PART"
	 * @example `:<nick>!<username>[at]<hostname> PART <channel> :"<part message>"`
	 */
	UserPart: "PART"

}

function checkString(str, minLength) {
	return str != undefined && str.constructor === String && (str.length >= minLength || minLength === undefined);
}

function validateChannel(channel) {
	if(!checkString(channel,2)) return "";
	if(channel[0] != "#") channel = "#" + channel;
	return channel;
}
