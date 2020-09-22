const { spawn } = require("child_process");

gmbuild = {
	menu_index: -1,
	compiled_without_error: false,
	runner_process: null,
	target_module: "VM",
	has_errors: false,

	// preference option initialization
	preferences_path: Electron_App.getPath("userData") + "/GMEdit/config/gmbuild-preferences.json",
	preferences_div: document.createElement("div"),
	preferences: {
		path_compiler: "",
		path_runner: "",
		path_debugger: "",
		path_debug_xml: "",
		path_options: ""
	},
	preferences_save: function () {
		Electron_FS.writeFileSync(this.preferences_path, JSON.stringify(this.preferences));
	},
	preferences_load: function () {
		return Object.assign(this.preferences, JSON.parse(Electron_FS.readFileSync(this.preferences_path)));
	},

	system_init: function () {
		// load preferences file
		if (Electron_FS.existsSync(this.preferences_path)) {
			this.preferences = this.preferences_load();
		}

		// give the existing lint timer status some room
		element_ace_status_comp = document.querySelector('.ace_status-comp');
		element_ace_status_comp.style.paddingRight = "5px";

		// create module select form
		element_module_form = document.createElement("form");
		element_module_form.style.borderLeft = "1px solid #bbb";
		element_module_form.style.paddingLeft = "5px";
		element_module_form.style.paddingRight = "5px";
		document.getElementsByClassName("ace_status-bar")[0].appendChild(element_module_form);

		// create module select label
		element = document.createElement("label");
		element.htmlFor = "module_select";
		element.innerText = "Module";
		element_module_form.appendChild(element);

		// create module select
		module_dropdown_element = document.createElement("select");
		module_dropdown_element.style.marginLeft = "5px";
		module_dropdown_element.style.marginRight = "5px";
		module_dropdown_element.id = "module_select";
		option = document.createElement("option");
		option.innerText = "VM";
		module_dropdown_element.appendChild(option);
		option = document.createElement("option");
		option.innerText = "YYC";
		module_dropdown_element.appendChild(option);
		option = document.createElement("option");
		option.innerText = "WEB";
		module_dropdown_element.appendChild(option);
		element_module_form.appendChild(module_dropdown_element);

		// create debug checkbox
		element = document.createElement("label");
		element.htmlFor = "debug_checkbox";
		element.innerText = "Use Debugger";
		element.style.paddingLeft = "5px";
		element.style.paddingRight = "5px";
		element_module_form.appendChild(element);
		let debugger_checkbox_element = document.createElement("input");
		debugger_checkbox_element.setAttribute("type", "checkbox");
		debugger_checkbox_element.id = "debug_checkbox";
		element_module_form.appendChild(debugger_checkbox_element);


		// hook into error linter "setError" to allow for the checking of errors directly
		$gmedit["parsers.linter.GmlLinter"].prototype.setError = (function () {
			var cached_function = $gmedit["parsers.linter.GmlLinter"].prototype.setError;
			return function () {
				var result = cached_function.apply(this, arguments); // call original
				gmbuild.has_errors = (this.errorText != "");
				console.log("Has errors: ", gmbuild.has_errors);
				return result;
			};
		})();

		// hook into error linter "addError" to allow for the checking of errors directly
		$gmedit["parsers.linter.GmlLinter"].prototype.addError = (function () {
			var cached_function = $gmedit["parsers.linter.GmlLinter"].prototype.addError;
			return function () {
				var result = cached_function.apply(this, arguments); // call original
				gmbuild.has_errors = gmbuild.has_errors || (this.errors.length > 0);
				console.log("Has errors: ", gmbuild.has_errors);
				return result;
			};
		})();
	},

	// saves all open files and starts the asset compiler
	build: function (execRunner) {

		target_module = document.getElementById("module_select").value;

		// clear console
		var console_div_node = document.getElementById('console_div');
		console_div_node.innerHTML = "";

		// return early if there is no project open
		if ($gmedit["gml.Project"].current.version.isReady == false) { console.divlog("Can't build without a loaded project."); return false; }

		// reset the check for errors
		gmbuild.has_errors = false;

		// save all before building
		for (let tab of $gmedit["ui.ChromeTabs"].impl.tabEls) {
			if (tab.gmlFile.__changed == true) {
				tab.gmlFile.save();
			}
		}

		// check for errors
		if (gmbuild.has_errors) { return; }

		// project info
		let projectname = $gmedit["gml.Project"].current.displayName;
		// directories
		let tempdir = Electron_App.getPath("temp");
		let outputdir = tempdir + '/GMEdit/' + projectname + '/output';

		// yyc and html5
		let compile_to_vm = '/cvm';
		let llvm_source = '';
		let module_param = '/m=win';
		if (target_module == "YYC") {
			console.log("Using YYC");
			llvm_source = '/llvmSource="C:/Users/liamn/AppData/Roaming/GameMaker-Studio/YYC"';
			module_param = '/m=llvm-win';
			compile_to_vm = '';
		} else if (target_module == "WEB") {
			console.log("Using HTML5");
			module_param = '/m=html5';
		}

		// debug
		let debug_param = '';
		if (document.getElementById("debug_checkbox").checked) { debug_param = '/debug'; }

		// test if options is created
		console.log('/optionsini="' + outputdir + '/options.ini"');

		console.log("Current path_options", gmbuild.preferences.path_options);

		// build param array
		let build_params = ['/llvmSource="C:/Users/liamn/AppData/Roaming/GameMaker-Studio/YYC"'];
		build_params.push('/c');
		build_params.push(module_param);
		if (target_module == "WEB") {
			build_params.push(
				'/nodnd',
				'/obfuscate',
				'/wt',
				'/html5folder="js"',
				'/nocache_html5',
				'/HTMLRunner="C:/Users/liamn/AppData/Roaming/GameMaker-Studio/scripts.html5.zip"');
		}
		build_params.push(debug_param);
		build_params.push('/config');
		build_params.push("Default");
		build_params.push('/tgt=64');
		build_params.push('/obob=True');
		build_params.push('/obpp=False');
		build_params.push('/obru=True');
		build_params.push('/obes=False');
		build_params.push('/i=3');
		build_params.push('/j=8');
		build_params.push(compile_to_vm);
		build_params.push('/tp', 2048);
		build_params.push('/mv=1');
		build_params.push('/iv=0');
		build_params.push('/rv=0');
		build_params.push('/bv=9999');
		build_params.push('/gn="' + projectname + '"');
		build_params.push('/td="' + tempdir + '/GMEdit/' + projectname + '"');
		build_params.push('/cd', tempdir + '/GMEdit/' + projectname + '/cachedir');
		build_params.push('/sh=True');
		build_params.push('/dbgp="6502"');
		build_params.push('/hip="192.168.1.17"');
		build_params.push('/hprt="51268"');
		build_params.push('/optionsini="' + gmbuild.preferences.path_options + '"');
		build_params.push('/o="' + outputdir + '"');
		build_params.push('"' + $gmedit["gml.Project"].current.path + '"');

		// execute compile
		gmbuild.compiled_without_error = true;
		let build_process = spawn(gmbuild.preferences.compiler_location, build_params);

		// send compiler output to dev console
		build_process.stdout.on('data', (data) => {
			if (data.includes("Error : ")) {
				console.divlog(`<span style="color: red">COMPILER: ${data}<span>`);
				gmbuild.compiled_without_error = false;
				build_process.kill();
			} else {
				console.divlog(`COMPILER: ${data}`);
			}
		});

		// set compile flag to true and optionally execute the runner
		build_process.on('exit', (code) => {
			console.divlog(`COMPILER EXIT CODE: ${code}`);

			if (execRunner && gmbuild.compiled_without_error) {
				gmbuild.run();
			} else if (!gmbuild.compiled_without_error) {
				console.divlog(`<span style="color: yellow">There was a compiler error. Please check the compile log.<span>`);
			}
		});
	},

	// runs the application
	run: function () {
		// if not compiled yet, do not allow running
		if (gmbuild.compiled_without_error !== true) {
			console.divlog(`<span style="color: yellow">It appears that you have yet to successfully compile the game.<span>`);
			return false;
		}

		// project info
		let projectname = $gmedit["gml.Project"].current.displayName;
		// directories
		let tempdir = Electron_App.getPath("temp");
		let outputdir = tempdir + '/GMEdit/' + projectname + '/output';
		let gamedir = '"' + outputdir + '/' + $gmedit["gml.Project"].current.displayName + '.win' + '"';

		// if a running process exists, kill it
		if (gmbuild.runner_process != null) {
			gmbuild.runner_process.kill();
			delete runner_process;
		}

		switch (target_module) {
			case "VM":
				console.divlog("Running executable from " + outputdir + "/" + $gmedit["gml.Project"].current.displayName + ".win");
				gmbuild.runner_process = spawn(gmbuild.preferences.path_runner, ['-game', outputdir + "/" + $gmedit["gml.Project"].current.displayName + ".win"]);

				// debugger
				if (document.getElementById("debug_checkbox").checked) {
					const debugger_process = spawn(gmbuild.preferences.path_debugger,
						['-d', outputdir + "/" + $gmedit["gml.Project"].current.displayName + '.yydebug',
							'-t', '127.0.0.1',
							'-u', gmbuild.preferences.path_debug_xml,
							'-p', $gmedit["gml.Project"].current.path,
							'-c', "Default",
							'-ac', gmbuild.preferences.path_compiler,
							'-tp', 6502]);

					// send debugger output to dev console
					debugger_process.stdout.on('data', (data) => {
						console.divlog(`DEBUGGER: ${data}`);
					});
				}
				break;
			case "YYC":
				console.divlog("Running executable from " + outputdir + "/" + $gmedit["gml.Project"].current.displayName.replace(/ /g, "_") + ".exe");
				gmbuild.runner_process = spawn(outputdir + "/" + $gmedit["gml.Project"].current.displayName.replace(/ /g, "_") + ".exe");
				break;
			case "WEB":
				gmbuild.runner_process = spawn("C:/Users/liamn/AppData/Roaming/AceGM/GMEdit/plugins/gmbuild/webserver-win.exe", ["--folder", outputdir + '/']);
				break;
		}

		// send runner output to dev console
		gmbuild.runner_process.stdout.on('data', (data) => {
			console.divlog(`RUNNER: ${data}`);
		});

		return true;
	},

	ParseDescriptor: function (string) {
		// Parse error descriptor and return object about it!
		let Descriptor = {};
		if (string.startsWith("gml_")) string = string.slice(4);
		Descriptor.Type = string.slice(0, string.indexOf("_"));
		string = string.slice(Descriptor.Type.length + 1);
		Descriptor.Line = parseInt(string.slice(string.lastIndexOf("(") + 1, string.lastIndexOf(")")).replace("line", ""));
		string = string.slice(0, string.lastIndexOf("(")).trim();
		if (Descriptor.Type == "Object") {
			Descriptor.Event = string.slice(string.lastIndexOf("_", string.lastIndexOf("_") - 1) + 1);
			string = string.slice(0, (Descriptor.Event.length * -1) - 1);
		}
		Descriptor.Asset = string;
		return Descriptor;
	},

	GetEvent: function (event) {
		// Turn descriptor event into GMEdit event name! 
		let SubEvent = event.slice(event.lastIndexOf("_") + 1), GmlEvent = $gmedit["parsers.GmlEvent"];
		event = event.slice(0, event.lastIndexOf("_"));
		for (let i = 0; i < GmlEvent.t2sc.length; i++) {
			if (GmlEvent.t2sc[i] == event) {
				return GmlEvent.i2s[i][SubEvent];
			}
		}
		return "";
	}
};

(function () {
	GMEdit.register("gmbuild",
		{
			init: function () {
				gmbuild.system_init();

				// main menu items
				let MainMenu = $gmedit["ui.MainMenu"].menu;
				MainMenu.items.forEach((item, index) => {
					if (item.label.toLowerCase() == "close project") {
						gmbuild.menu_index = ++index + 1;
						MainMenu.insert(index++, new Electron_MenuItem({ type: "separator" }));
						MainMenu.insert(index++, new Electron_MenuItem({ label: "Build and run", accelerator: "F5", enabled: true, click: gmbuild.build_and_run }));
						MainMenu.insert(index, new Electron_MenuItem({ label: "Run last build", accelerator: "F6", enabled: true, click: gmbuild.run }));
					}
				});

				// preferences
				let pref = $gmedit["ui.Preferences"];
				pref.addText(gmbuild.preferences_div, "").innerHTML = "<b>GMBuild Settings</b>";
				pref.addInput(gmbuild.preferences_div, "GMAssetCompiler location", gmbuild.preferences.path_compiler, (value) => { gmbuild.preferences.path_compiler = value; gmbuild.preferences_save(); });
				pref.addInput(gmbuild.preferences_div, "Runner location", gmbuild.preferences.path_runner, (value) => { gmbuild.preferences.path_runner = value; gmbuild.preferences_save(); });
				pref.addInput(gmbuild.preferences_div, "Debugger location", gmbuild.preferences.path_debugger, (value) => { gmbuild.preferences.path_debugger = value; gmbuild.preferences_save(); });
				pref.addInput(gmbuild.preferences_div, "Debugger XML location (optional)", gmbuild.preferences.path_debug_xml, (value) => { gmbuild.preferences.path_debug_xml = value; gmbuild.preferences_save(); });
				pref.addInput(gmbuild.preferences_div, "Options location `options.ini` (required for YYC)", gmbuild.preferences.path_options, (value) => { gmbuild.preferences.path_options = value; gmbuild.preferences_save(); });
				pref.addButton(gmbuild.preferences_div, "Back", () => { pref.setMenu(pref.menuMain); gmbuild.preferences_save(); });
				let buildMain = pref.buildMain;
				pref.buildMain = function (arguments) {
					let Return = buildMain.apply(this, arguments);
					pref.addButton(Return, "GMBuild Settings", function () {
						pref.setMenu(gmbuild.preferences_div);
					});
					return Return;
				};

				// keyboard shortcuts
				let AceCommands = $gmedit["ace.AceCommands"];
				AceCommands.add({ name: "build", bindKey: "F5", exec: function () { gmbuild.build(true); } }, "Build and run");
				AceCommands.addToPalette({ name: "gmbuild: Compile and run your project", exec: "build", title: "Build and run" });
				AceCommands.add({ name: "run", bindKey: "F6", exec: gmbuild.run }, "Run last build");
				AceCommands.addToPalette({ name: "gmbuild: Run your project", exec: "run", title: "Run" });

				// console window
				var node = document.createElement("div");
				node.style = "height: 256px; overflow: auto; font-family: monospace; white-space: pre";
				node.id = "console_div";
				document.getElementById("ace_container").appendChild(node);

				// divlog function for logging runner and debugger
				console.divlog = function (message) {
					var console_div_node = document.getElementById('console_div');
					var inner_node = document.createElement("div");

					if (message.includes("ERROR!!! :: ") == true) {

						let lines = (message.toString()).split("\n");
						for (let _i = 0; _i < lines.length; _i++) {
							let line_string = lines[_i];
							if (line_string.startsWith("stack frame is") == true) {
								let stack_string = lines[_i + 1];

								let Descriptor = {};
								if (stack_string.startsWith("gml_")) stack_string = stack_string.slice(4);
								Descriptor.Type = stack_string.slice(0, stack_string.indexOf("_"));
								stack_string = stack_string.slice(Descriptor.Type.length + 1);
								Descriptor.Line = parseInt(stack_string.slice(stack_string.lastIndexOf("(") + 1, stack_string.lastIndexOf(")")).replace("line", ""));
								stack_string = stack_string.slice(0, stack_string.lastIndexOf("(")).trim();
								if (Descriptor.Type == "Object") {
									Descriptor.Event = stack_string.slice(stack_string.lastIndexOf("_", stack_string.lastIndexOf("_") - 1) + 1);
									stack_string = stack_string.slice(0, (Descriptor.Event.length * -1) - 1);
								}
								Descriptor.Asset = stack_string;

								console.log(Descriptor);

								Stack = Descriptor;

								inner_node.setAttribute("style", "color: #FF8080;");
								inner_node.onclick = function () {

									if ($gmedit["ui.OpenDeclaration"].openLocal(Stack.Asset, Stack.Line) == true) {
										setTimeout(() => {
											let Offset = 0;
											if (Stack.Type == "Object") {
												for (let Event = gmbuild.GetEvent(Stack.Event), k = 0; k < aceEditor.session.getLength(); k++) {
													if (aceEditor.session.getLine(k).startsWith("#event " + Event) == true) {
														Offset = ++k;
														break;
													}
												}
											}
											aceEditor.gotoLine(Stack.Line + Offset);
										}, 10);
									}

								}
							}
						}
					}
					console_div_node.appendChild(inner_node);
					inner_node.innerHTML = message;
					console_div_node.scrollTop = console_div_node.scrollHeight;
				};

				/*if (typeof console != "undefined")
					if (typeof console.log != 'undefined')
						console.olog = console.log;
					else
						console.olog = function () { };

				console.log = function (message) {
					console.olog(message);
					var console_div_node = document.getElementById('console_div');
					console_div_node.innerHTML += message + '<br>';
					console_div_node.scrollTop = console_div_node.scrollHeight;
				};
				
				console.error = console.debug = console.info = console.log;
				*/
			}
		});
})();