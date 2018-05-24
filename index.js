'use strict';
const fse = require('fs-extra'),
	fs = require('extfs'),
	simpleGit = require('simple-git'),
	{ yellow, red } = require('chalk'),
	{ basename, dirname, extname } = require('path'),
	{ exec } = require('shelljs'),
	{ prompt } = require('inquirer'),

	args = process.argv,
	cwd = process.cwd(),
	ignoreHiddenFiles = /(^|\/)\.[^\/\.]/ig,
	restrictUserInputPattern = /\b[a-zA-Z]{2}(-)\d{2,3}\b/g,
	configRule = /\b[a-zA-Z]{2}\b/,
	pathToSection = `${cwd}/source/sections`;

let isGit = true,
	pathToConfig ='',
	devInitials = '',
	jsonContents,
	section,
	originalDir,
	howMany,
	originalNamespace,
	pathToOriginalDir,
	pathToNewDev,
	blurb,
	newBranch,
	lastSuffix,
	emptyFile,
	createConfig = '',
	inputJSONinitials,
	pathsToNewVariations = [],
	existingDirs = [],
	newSuffixes = [],
	configMissing = false,
	fileToReplace = true;



// INITIALIZATION ---------------------------
if (args.includes('--create-tree')) {
	if (!fse.existsSync(`${cwd}/funnel`)) {
		const dirStubs = [
			'funnel/source/sections/home/ga/ga-01',
			'funnel/source/sections/home/bm/bm-01',
			'funnel/source/sections/report-review/ga/ga-01',
			'funnel/source/sections/report-review/ga/ga-02',
			'funnel/source/sections/report-review/jc/jc-01'
		];

		const extensions = [
			'.php',
			'.js',
			'.less'
		];

		dirStubs.forEach(dir => {
			exec(`mkdir -p ${dir}`);
			extensions.forEach(ext => {
				fs.closeSync(fs.openSync(`${dir}/${dir.slice(-5)}${ext}`, 'w'));
			});
		});

		console.log(yellow(`Directory structure and files generated!\nPlease move into the funnel/ directory and run \'yo tcg\'`));
		process.exit();
	} else {
		console.log(red('funnel/ directory already exists! Aborting.'));
		process.exit();
	}
}

// if no .git file is found (if not a Git repository)
if (!fse.existsSync(`${cwd}/.git`)) {
	isGit = false;
}

if (!args.includes('--skip-git') && isGit === true) {
	simpleGit()
	.checkout('master')
	.pull('origin', 'master');
}

emptyFile = fs.isEmptySync(`${cwd}/config.json`);

// check if config.json exists
if (fse.existsSync(`${cwd}/config.json`)) {
	pathToConfig = `${cwd}/config.json`;

  if (emptyFile === true) {
    console.log(red('Your config.json is empty!! Please see README for details.'));
    process.exit();
  }

	try {
		// try to get contents of JSON
		jsonContents = JSON.parse(fse.readFileSync(pathToConfig, 'utf8'));
		try {
			// try to set devInitials
			devInitials = require(pathToConfig).developer.replace(/\s/g,'');
			if (devInitials === '') {
				console.log(red('Please specify your initials in config.json'));
				process.exit();
			}
		} catch(e) {
			console.log(red('config.json is misconfigured! See README for more details.'));
			process.exit();
		}
	} catch(e) {
		// if JSON is invalid
		console.log(red('config.json is invalid. Please fix and try again.'));
		process.exit();
	}

} else {
	console.log(red('Your config.json is missing!!'));
	configMissing = true;
}
// END INITIALIZATION ---------------------------



const questions = [{
	when: configMissing,
  type: 'confirm',
  name: 'createConfig',
  message: 'Create config.json?'
},{
	when: answers => answers.createConfig,
  type: 'input',
  name: 'inputJSONinitials',
  message: 'What are your initials?',
	filter: value => {
		return value.toLowerCase().replace(/\s/g,'');
	},
	validate: value => {
		if (value.match(configRule)) {
			return true;
		} else {
			console.log(yellow(' Please enter exactly two alphabetical characters.'));
		}
	}
},{
	when: answers => answers.createConfig || !configMissing,
  type: 'input',
  name: 'section',
  message: 'What section are you working on?',
	filter: value => {
		return value.toLowerCase().replace(/\s/g,'');
	},
  validate: value => {
		if (value === '' || !value.replace(/\s/g, '').length) {
			console.log(yellow(' Please enter a valid name.'));
		} else if (fse.existsSync(`${pathToSection}/${value}`)) {
      return true;
    } else {
      console.log(yellow(" Section doesn't exist!"));
      return false;
    }
  }
},{
	when: answers => answers.createConfig || !configMissing,
  type: 'input',
  name: 'originalDir',
  message: 'Which directory do you wish to copy?',
	filter: value => {
		return value.toLowerCase().replace(/\s/g,'');
	},
  validate: value => {
    // ensure user input is two letters, a hyphen, and 2-3 digits
    if (value.match(restrictUserInputPattern)) {
      return true;
    } else {
      console.log(yellow(' Invalid directory name!'));
      return false;
    }
  }
},{
	when: answers => answers.createConfig || !configMissing,
  type: 'number',
  name: 'howMany',
  message: 'How many variations would you like?',
	filter: value => {
		return value.toLowerCase().replace(/\s/g,'');
	},
	validate: value => {
		if (!isNaN(parseFloat(value)) && isFinite(value) && value % 1 === 0) {
			if (parseFloat(value) === 0) {
				console.log(yellow(' What? You don\'t want that.'));
				return false;
			} else if (parseFloat(value) > 10) {
				console.log(yellow(' Too many variations!'));
				return false;
			} else {
				return true;
			}
		} else {
			console.log(yellow(' Please enter a whole number.'));
			return false;
		}
	}
},{
	when: !args.includes('--skip-git') && isGit === true && (answers => answers.createConfig || !configMissing),
  type: 'input',
  name: 'blurb',
  message: 'Please enter a short branch description:',
	filter: value => {
		return value.toLowerCase().replace(/\s/g,'');
	},
	validate: value => {
		if (value === '' || value === 'undefined') {
			console.log(yellow(' Invalid name!'));
		} else {
			return true;
		}
	}
}];

prompt(questions).then(answers => {
	section = answers.section;
  originalDir = answers.originalDir;
	howMany = answers.howMany;
	blurb = answers.blurb;
	createConfig = answers.createConfig;
	inputJSONinitials = answers.inputJSONinitials;

	function configCreatedMessage(err) {
		if (err) throw err;
		console.log(yellow('config.json created!'));
	}

	function copyIt(variation) {
		if (!fse.existsSync(pathToOriginalDir)) {
			console.log(yellow(`${originalDir} doesn't exist! Aborting.`));
			process.exit();
		} else {
			try {
				fse.copySync(pathToOriginalDir, variation);
			} catch (err) {
				console.log(err);
			}
		}
	}

	function throwErr(err) {
		if (err) throw err;
	}



	function skipHiddenFiles(files) {
		files = files.filter(item => !(ignoreHiddenFiles).test(item));
	}













	// ABANDON ---------------------------
	if (createConfig === false) {
		console.log(yellow('Please create your config.json file and try again. Aborting.'));
		process.exit();
	}
	// END ABANDON ---------------------------



	// CREATE JSON ---------------------------
	if (inputJSONinitials) {
		let fileContent = `{\n\t"developer": "${inputJSONinitials}"\n}`,
			filePath = `${cwd}/config.json`;
		fs.writeFile(filePath, fileContent, configCreatedMessage);
	}
	// END CREATE JSON ---------------------------



	// MANIPULATION ---------------------------
	originalNamespace = originalDir.substr(0, originalDir.indexOf('-'));
	pathToOriginalDir = `${pathToSection}/${section}/${originalNamespace}/${originalDir}`;
	pathToNewDev = `${pathToSection}/${section}/${devInitials}`;

	if (inputJSONinitials) {
		pathToNewDev = `${pathToSection}/${section}/${inputJSONinitials}`;
	}

	if (!fse.existsSync(pathToNewDev)) {
		fse.mkdirSync(pathToNewDev);
	}

	// get array of existing dirs
	fse.readdirSync(pathToNewDev).forEach(dir => existingDirs.push(dir));

	// put array items in numerical order (so last item will have the greatest numerical value)
	existingDirs.sort((a, b) => {
		let firstItem = parseFloat(a.substring(a.indexOf('-') + 1, a.length)),
			secondItem = parseFloat(b.substring(b.indexOf('-') + 1, b.length));
		if (firstItem < secondItem) {
	    return -1;
	  }
	  if (firstItem > secondItem) {
	    return 1;
	  }
	  return 0;
	});

	// find last existing dir
	let lastDir = existingDirs[existingDirs.length - 1];

	// get last suffix from array of existing dirs
	lastSuffix = existingDirs.length === 0 ? "0" : lastDir.substring(lastDir.indexOf('-') + 1, lastDir.length);

	// create array of numerically next suffixes
	for (let i = 1; i <= howMany; i++) {
		newSuffixes.push(parseFloat(lastSuffix) + i);
	}

	// convert array of numbers to array of strings
	let suffixesStringy = newSuffixes.map(String);

	function string(x) {
		suffixesStringy.forEach(suffix => {
			pathsToNewVariations.push(`${pathToNewDev}/${x}-${suffix.padStart(2, '0')}`);
		});
		newBranch = `${x}_${section}_${blurb}`;
	}

	if (devInitials) {
		string(devInitials);
	} else if (inputJSONinitials) {
		string(inputJSONinitials);
	}
	// END MANIPULATION ---------------------------



	// CHECK BRANCH ---------------------------
	if (!args.includes('--skip-git') && isGit === true) {
		// check if the branch already exists locally
		if (exec(`git rev-parse --verify --quiet \'${newBranch}\'`, {silent:true}).length > 0) {
			console.log(yellow('ERROR: local branch already exists. Terminating process.'));
			process.exit();
		// check if the branch already exists remotely
		} else if (exec(`git ls-remote --heads origin \'${newBranch}\'`, {silent:true}).length > 0) {
			console.log(yellow('ERROR: remote branch already exists. Terminating process.'));
			process.exit();
		}
	}
	// END CHECK BRANCH ---------------------------



	pathsToNewVariations.forEach(copyIt);

	pathsToNewVariations.forEach(variation => {
		fse.readdir(variation, (err, files) => {
			skipHiddenFiles(files);
			files.forEach(file => {
				let fullPath = `${variation}/${file}`,
					newPart = basename(dirname(fullPath));
				fs.rename(fullPath, fullPath.replace(originalDir, newPart), throwErr);
			});
		});
	});

	setTimeout(function() {
		// PHP COMMENT ---------------------------
		if (!args.includes('--skip-comment')) {
			pathsToNewVariations.forEach(variation => {
				fse.readdir(variation, (err, files) => {
					skipHiddenFiles(files);
					files.forEach(file => {
						let newFile = `${variation}/${file}`;
						if (extname(newFile) === '.php') {
							fs.readFile(newFile, 'utf8', (err, data) => {
								if (err) throw err;
								if (data.indexOf('<!-- copied from') >= 0) {
									let commentRegEx = /(\<\!\-{2}\scopied\sfrom\s.{0,6}\s\-{2}\>)/g,
										replacement = data.replace(commentRegEx, `<!-- copied from ${originalDir} -->`);
									fs.writeFile(newFile, replacement, 'utf8', throwErr);
									// log this message only once
									if (fileToReplace === true) {
										console.log(yellow('existing comment replaced.'));
										fileToReplace = false;
									}
								} else {
									fs.appendFileSync(newFile, `<!-- copied from ${originalDir} -->`);
								}
							});
						}
					});
				});
			});
		}
		// END PHP COMMENT ---------------------------
	}, 50)





	// MESSAGING ---------------------------
	let items = [];
	pathsToNewVariations.forEach(variation => items.push(basename(variation)));
	if (items.length > 0) {
		console.log(yellow(`${howMany} variation${(items.length > 1) ? 's' : ''} created: ${items}.`));
	} else {
		// not sure if this is the best place for this error message
		console.log(red('Something went wrong. Zero variations created.'));
		process.exit();
	}
	// END MESSAGING ---------------------------






	setTimeout(function () {
		// GIT ---------------------------
		if (!args.includes('--skip-git') && isGit === true) {
			try {
				simpleGit()
					.checkoutBranch(newBranch, 'master', (err, result) => {
						console.log(yellow(`Switched to new branch ${newBranch}`));
					})
					.add('./*')
					.commit(`copied ${originalDir}`, (err, result) => {
						console.log(yellow('Changes staged and committed'));
					})
					.push(['-u', 'origin', `${newBranch}`], (err, result) => {
						console.log(yellow('Pushed!'));
					});
			} catch (err) {
				console.log(err);
			}
		}
		// END GIT ---------------------------
	}, 50);


});
