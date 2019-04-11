Object.assign(Sphere.Game, {
	version: 2,
	apiLevel: 2,
	name: "SphereIRC",
	author: "Eggbertx",
	saveID: "eggbertx.SphereIRC",
	summary: "An IRC client (and maybe eventually server) module for miniSphere",
	resolution: '640x480',
	main: '@/scripts/main.js',
});

install('@/scripts', files('src/*.js'));
install('@/lib', files('lib/*.js'));
install('@/', files('config.json'));
