import { Thread,Console } from 'sphere-runtime';
import { IRCClient } from 'irc';

const kb = Keyboard.Default;
const font = Font.Default;
const screen = Surface.Screen;

export default class Main extends Thread {
	constructor() {
		super();

		let cfg = JSON.parse(FS.readFile("@/config.json"));
		this.console = new Console({
			logFileName: "~/log.txt"
		});
		this.client = new IRCClient(cfg, this.console);
		this.console.defineObject("irc", null, {
			"sendLine": (hostname, line) => {
				let server = this.client.getServer(hostname);
				if(server) this.client.sendLine(server, line);
			}
		});

		this.client.addEventHandler("*","PRIVMSG", (server, channel, message) => {
			SSj.log(`${server.hostname}[${channel}]: ${message}`);
			if(message == "ping") {

			}
		});

		this.client.start();
		this.client.connect();
	}

	on_update() {
		if(kb.isPressed(Key.Escape)) {
			this.client.disconnect();
			Sphere.shutDown();
		}
	}

	on_render() {
		let lines = ["SphereIRC Connections:",""];

		for(let server of this.client.servers) {
			lines.push(
				`Server: ${server.hostname}:${server.port?server.port:6667}`,
				`Channels: ${server.joinedChannels}`, ""
			);
		}
		for(let l in lines) {
			font.drawText(screen, 0, 4+l*font.height, lines[l]);
		}
	}
}
