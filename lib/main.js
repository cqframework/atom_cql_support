const { AutoLanguageClient } = require("atom-languageclient");
const { install } = require("atom-package-deps");
const path = require('path');
const cp = require("child_process");

class CQLLanguageClient extends AutoLanguageClient {
  getGrammarScopes() {
    //console.log('CQLLanguageClient.getGrammarScopes');
    return [ "source.cql" ];
  }
  getLanguageName() {
    //console.log('CQLLanguageClient.getLanguageName');
    return "cql";
  }
  getServerName() {
    //console.log('CQLLanguageClient.getServerName');
    return "cql-language-server";
  }

  startServerProcess() {
    //console.log('CQLLanguageClient.startServerProcess');
    const options = { 'cwd': __dirname };
    const command = "java";
    const jarpath = path.join(__dirname, '..', 'language-server', 'fat-jar.jar');

    var args = [
        '-cp',
        jarpath,
        '-Xverify:none', // helps VisualVM avoid 'error 62',
        'org.cqframework.cql.Main'
    ];

    const child = cp.spawn(command, args, options);
    this.captureServerErrors(child);
    return child;
  }
}

module.exports = new CQLLanguageClient();
