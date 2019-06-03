const { AutoLanguageClient } = require("atom-languageclient");
const { install } = require("atom-package-deps");
const path = require('path');
const cp = require("child_process");

class CQLLanguageClient extends AutoLanguageClient {
  getGrammarScopes() { return [ "source.cql" ]; }
  getLanguageName() { return "cql"; }
  getServerName() { return "cql-language-server"; }

  startServerProcess() {
    const projectPath = atom.project.rootDirectories[0].path;
    const options = { 'cwd': projectPath };
    const command = "java";
    const jarpath = path.join(__dirname, '..', 'language-server', 'fat-jar.jar');

    var args = [
        '-cp',
        jarpath,
        '-Xverify:none', // helps VisualVM avoid 'error 62',
        '-Xdebug',
        '-Xrunjdwp:transport=dt_socket,server=y,suspend=n,address=5051,quiet=y',
        'org.cqframework.cql.Main',
        projectPath
    ];

    const child = cp.spawn(command, args, options);
    this.captureServerErrors(child);
    return child;
  }
}

module.exports = new CQLLanguageClient();
