
const { installServiceIfRequired, getServicePath } = require('./java-service-installer');

const { getJavaCommand } = require('./java-helpers');

const cp = require("child_process");
const fs = require('fs');
const fileUrl = require('file-url');
const path = require('path');


async function ensureCQLService(connection, updateInstallCallback) {
    console.log('loading CQL service');
    await installServiceIfRequired("cql-evaluator", updateInstallCallback);
    addCQLExecuteMenu(connection);
};


function addCQLExecuteMenu(connection) {
    const executeCQLCommand = atom.commands.add(
        'atom-text-editor',
        'language-cql:executeCQLFile',
        async (e) => {
            executeCQLFile(e.currentTarget, false)
        }
    );

    atom.contextMenu.add({
        'atom-text-editor': [
            {
                type: 'separator'
            },
            {
                label: 'CQL',
                submenu: [{
                    label: "Execute CQL",
                    command: 'language-cql:executeCQLFile'
                }],
                shouldDisplay: async (e) => { atom.workspace.getActiveTextEditor().getGrammar().name == "CQL" }
            }]
    });
    connection.disposable.add(executeCQLCommand);

    const executeCQLCommandVerbose = atom.commands.add(
        'atom-text-editor',
        'language-cql:executeCQLFileVerbose',
        async (e) => {
            executeCQLFile(e.currentTarget, true)
        }
    );

    atom.contextMenu.add({
        'atom-text-editor': [
            {
                type: 'separator'
            },
            {
                label: 'CQL',
                submenu: [{
                    label: "Execute CQL (verbose)",
                    command: 'language-cql:executeCQLFileVerbose'
                }],
                shouldDisplay: async (e) => { atom.workspace.getActiveTextEditor().getGrammar().name == "CQL" }

            }]
    });
    connection.disposable.add(executeCQLCommandVerbose);
}


async function executeCQLFile(editor, verbose) {
    const jarPath = getServicePath("cql-evaluator");
    const command = getJavaCommand();

    //convert.default.pathToUri doesn't give a useable format.  Not sure if that's a problem.
    //hope it's not because path handles it.
    const libraryPath = editor.getModel().getPath();
    if (!fs.existsSync(libraryPath)) {
        atom.notifications.addInfo("No library content found. Please save before executing.", { dismissable: true });
        return;
    }

    const libraryPathName = path.basename(libraryPath, '.cql');

    //todo: replace with library-uri when it's ready
    const libraryDirectory = path.dirname(libraryPath);
    const libraryName = libraryPathName.split('-')[0];

    var projectPath = '';
    atom.project.getDirectories().forEach(function (dir) {
        if (dir.contains(libraryPath)) {
            projectPath = dir.path;
        }
    });

    //todo: make this a setting
    // var terminologyPath = atom.config.get("language-cql.terminologyServer");
    // // Undefined or blank
    // if ( (!terminologyPath || /^\s*$/.test(terminologyPath))) {
    var terminologyPath = path.join(projectPath, 'input', 'vocabulary', 'valueset');
    //}

    //todo: get this working (currently errors with: Index 0 out of bounds for length 0)
    //const measurementPeriod = 'Interval[@2019-01-01T00:00:00.0, @2020-01-01T00:00:00.0)';
    const modelType = "FHIR";
    var fhirVersion = "R4";
    const modelTypeSpecifier = modelType + '=';
    const measurementPeriod = ''
    const contextType = 'Patient';
    const contextTypeSpecifier = contextType + '=';
    const testPath = path.join(projectPath, 'input', 'tests');
    const resultPath = path.join(testPath, 'results');

    const fhirVersionRegex = /using (FHIR|"FHIR") version '(\d(.|\d)*)'/;
    var matches = editor.getModel().getText().match(fhirVersionRegex);

    if (matches && matches.length > 2) {
        const version = matches[2];
        if (version.startsWith("2")) {
            fhirVersion = "DSTU2"
        }
        else if (version.startsWith("3")) {
            fhirVersion = "DSTU3"
        }
        else if (version.startsWith("4")) {
            fhirVersion = "R4"
        }
        else if (version.startsWith("5")) {
            fhirVersion = "R5"
        }
    }
    else {
        atom.notifications.addInfo("Unable to determine version of FHIR used. Defaulting to R4.", { dismissable: true });
    }


    // Recursively creates directory
    mkDirByPathSync(resultPath);

    const modelRootPath = getModelRootPath(testPath, libraryPathName);

    var textEditor = await atom.workspace.open(`${path.join(resultPath, libraryPathName + '.txt')}`, {
        cursorBlink: false,
        visualBell: true,
        convertEol: true,
        termName: 'xterm-256color',
        scrollback: 1000,
        rows: 8
    });

    await textEditor.moveToBottom();
    var modelMessage = (modelRootPath && modelRootPath != '') ? `Data path: ${modelRootPath}` : `No tests found at ${testPath}. Evaluation may fail if data is required.`
    var terminologyMessage = (terminologyPath && terminologyPath != '') ? `Terminology path: ${terminologyPath}` : "No terminology path specified. Evaluation may fail if terminology is required."
    await textEditor.insertText('Running tests.\r\n');
    await textEditor.insertText(`${modelMessage}\r\n`);
    await textEditor.insertText(`${terminologyMessage}\r\n`);

    if (modelRootPath && modelRootPath != '') {
        var dirs = fs.readdirSync(modelRootPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())

        if (dirs && dirs.length > 0) {
            dirs.forEach(async (dirent) => {
                const context = dirent.name;
                const modelPathSpecifier = modelTypeSpecifier + fileUrl(path.join(modelRootPath, dirent.name));
                const contextSpecifier = contextTypeSpecifier + context;
                await executeCQL(textEditor, editor, command, jarPath, libraryDirectory, libraryName, fhirVersion, modelPathSpecifier, terminologyPath, contextSpecifier, context, measurementPeriod, verbose);
            });
        }
        else {
            await executeCQL(textEditor, editor, command, jarPath, libraryDirectory, libraryName, fhirVersion, null, terminologyPath, null, null, measurementPeriod, verbose);
        }
    }
    else {
        await executeCQL(textEditor, editor, command, jarPath, libraryDirectory, libraryName, fhirVersion, null, terminologyPath, null, null, measurementPeriod, verbose);
    }
}

function getModelRootPath(parentPath, libraryPathName) {
    var modelRootPath = '';
    fs.readdirSync(parentPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .forEach(dirent => {
            if (modelRootPath == '') {
                if (dirent.name == libraryPathName) {
                    modelRootPath = path.join(parentPath, dirent.name);
                } else {
                    modelRootPath = getModelRootPath(path.join(parentPath, dirent.name), libraryPathName)
                }
            }
        });
    return modelRootPath;
}

async function executeCQL(textEditor, editor, command, jarPath, libraryDirectory, libraryName, fhirVersion, modelPathSpecifier, terminologyPath, contextSpecifier, testName, measurementPeriod, verbose) {
    const args = getExecArgs(jarPath, libraryDirectory, libraryName, fhirVersion, modelPathSpecifier, terminologyPath, contextSpecifier, measurementPeriod, verbose, shouldDebug());
    console.log(command + ' ' + args.join(' '));

    if (!testName) {
        testName = "AdHoc";
    }

    const startExecution = new Date();
    cp.exec(`"${command}" ${args.join(' ')}`, async (error, stdout, stderr) => {
        const endExecution = new Date();
        if (error) {
            //console.error(`exec error: ${error}`);
            handleJarError(error, jarPath);
            //this results display should be in the caller, but I keep getting a null from the promise that's returned
            await textEditor.insertText(`Test (${testName})\r\n${new Date().toString()}\r\n${error}\r\n`);
            return;
        }
        if (stderr && stderr.length > 0) {
            console.error(`stderr: ${stderr}`);
        }
        //this results display should be in the caller, but I keep getting a null from the promise that's returned
        await textEditor.moveToBottom();
        await textEditor.insertText(`Test ${testName}\r\n${startExecution.toString()}\r\n`);
        await textEditor.insertText(`${stdout.toString()}elapsed: ${((endExecution - startExecution) / 1000).toString()} seconds\r\n\r\n`);
    });
}

function getExecArgs(jarPath, libraryDirectory, libraryName, fhirVersion, modelPathSpecifier, terminologyPath, contextSpecifier, measurementPeriod, verbose, debug) {
    var args = [];
    if (debug) {
        args.push('-Xdebug');
        args.push('-Xrunjdwp:transport=dt_socket,server=y,suspend=y,address=5051,quiet=y')
    }

    args.push('-jar');
    args.push(jarPath);
    args.push('--lu');
    args.push(`"${fileUrl(libraryDirectory)}"`);
    args.push('--ln')
    args.push(libraryName);

    if (fhirVersion && fhirVersion != '') {
        args.push('--fv');
        args.push(`"${fhirVersion}"`)
    }

    if (modelPathSpecifier && modelPathSpecifier != '') {
        args.push('-m');
        args.push(`"${modelPathSpecifier}"`);
    }

    if (terminologyPath && terminologyPath != '') {
        args.push('-t');
        args.push(`"${fileUrl(terminologyPath)}"`);
    }

    if (contextSpecifier && contextSpecifier != '') {
        args.push('-c');
        args.push(contextSpecifier);
    }

    if (measurementPeriod && measurementPeriod != '') {
        args.push('-p');
        args.push(`${libraryName}."Measurement Period"=${measurementPeriod}`);
    }

    // args.push('-v');
    // args.push(`${verbose.toString()}`);

    return args;
}

function shouldDebug() {
    return false; // atom.config.get('language-cql.toolDebug');
}

function mkDirByPathSync(targetDir, { isRelativeToScript = false } = {}) {
    const sep = path.sep;
    const initDir = path.isAbsolute(targetDir) ? sep : '';
    const baseDir = isRelativeToScript ? __dirname : '.';

    return targetDir.split(sep).reduce((parentDir, childDir) => {
        const curDir = path.resolve(baseDir, parentDir, childDir);
        try {
            fs.mkdirSync(curDir);
        } catch (err) {
            if (err.code === 'EEXIST') { // curDir already exists!
                return curDir;
            }

            // To avoid `EISDIR` error on Mac and `EACCES`-->`ENOENT` and `EPERM` on Windows.
            if (err.code === 'ENOENT') { // Throw the original parentDir error on curDir `ENOENT` failure.
                throw new Error(`EACCES: permission denied, mkdir '${parentDir}'`);
            }

            const caughtErr = ['EACCES', 'EPERM', 'EISDIR'].indexOf(err.code) > -1;
            if (!caughtErr || caughtErr && curDir === path.resolve(targetDir)) {
                throw err; // Throw if it's just the last created dir.
            }
        }

        return curDir;
    }, initDir);
}



exports.ensureCQLService = ensureCQLService;