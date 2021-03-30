const cp = require("child_process");
const fs = require('fs');
const path = require('path');
const { shell } = require('electron');

function checkJavaVersion(minJavaRuntime) {
    let command = getJavaCommand();
    return new Promise((resolve, reject) => {
        const childProcess = cp.spawn(command, ['-showversion', '-version'])
        childProcess.on('error', err => {
            showJavaRequirements(
                'language-cql could not launch your Java runtime.',
                err.code == 'ENOENT'
                    ? `No Java runtime found at <b>${command}</b>.`
                    : `Could not spawn the Java runtime <b>${command}</b>.`,
                    minJavaRuntime
            )
            reject()
        })
        let stdErr = '', stdOut = ''
        childProcess.stderr.on('data', chunk => stdErr += chunk.toString())
        childProcess.stdout.on('data', chunk => stdOut += chunk.toString())
        childProcess.on('close', exitCode => {
            const output = stdErr + '\n' + stdOut
            if (exitCode === 0 && output.length > 2) {
                const version = getJavaVersionFromOutput(output)
                if (version == null) {
                    showJavaRequirements(
                        `language-cql requires Java ${minJavaRuntime} but could not determine your Java version.`,
                        `Could not parse the Java '--showVersion' output <pre>${output}</pre>.`,
                        minJavaRuntime
                    )
                    reject()
                }
                if (version >= minJavaRuntime) {
                    resolve(version)
                } else {
                    showJavaRequirements(
                        `language-cql requires Java ${minJavaRuntime} or later but found ${version}`,
                        `If you have Java ${minJavaRuntime} installed please Set Java Path correctly. If you do not please Download Java ${minJavaRuntime} or later and install it.`,
                        minJavaRuntime
                    )
                    reject()
                }
            } else {
                atom.notifications.addError('language-cql encountered an error using the Java runtime.', {
                    dismissable: true,
                    description: stdErr != '' ? `<code>${stdErr}</code>` : `Exit code ${exitCode}`
                })
                reject()
            }
        })
    })
}

function getJavaVersionFromOutput(output) {
    const match = output.match(/ version "(\d+(.\d+)?)(.\d+)*(_\d+)?(?:-\w+)?"/)
    return match != null && match.length > 0 ? Number(match[1]) : null
}

function showJavaRequirements(title, description, minJavaRuntime) {
    atom.notifications.addError(title, {
        dismissable: true,
        buttons: [
            { text: 'Set Java Path', onDidClick: () => shell.openExternal('https://www.java.com/en/download/help/path.xml') },
            { text: 'Download OpenJDK', onDidClick: () => shell.openExternal('https://adoptopenjdk.net/?variant=openjdk11&jvmVariant=openj9') },
        ],
        description: `${description}<p>If you have Java installed please Set Java Path correctly. If you do not please Download Java ${minJavaRuntime} or later and install it.</p>`
    })
}

function getJavaCommand() {
    const javaPath = getJavaPath()
    return javaPath == null ? 'java' : path.join(javaPath, 'bin', 'java')
}

function getJavaPath() {
    return (new Array(
        atom.config.get('ide-java.javaHome'),
        process.env['JDK_HOME'],
        process.env['JAVA_HOME'])
    ).find(j => j)
}

exports.getJavaCommand = getJavaCommand;
exports.checkJavaVersion = checkJavaVersion;