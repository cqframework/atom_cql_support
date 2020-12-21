const { DownloadFile } = require('atom-languageclient');
const packagejson = require('../package.json');
const fs = require('fs');

const request = require('request-promise-native');
const path = require('path');

function getJavaCoords(serviceName) {
    const coords = {
        groupId: packagejson[serviceName].groupId,
        artifactId: packagejson[serviceName].artifactId,
        version: packagejson[serviceName].version,
        classifier: packagejson[serviceName].classifier
      };

    return coords;
};

function getJarHome() {
    return path.join(__dirname, '..', 'jars');
}

function getJarPath(serviceName) {
  const jarHome = getJarHome();
  const jarName = getLocalName(getJavaCoords(serviceName));
  return path.join(jarHome, jarName);
}

function getLocalName(coords) {
    return (coords.artifactId + "-" + coords.version + (coords.classifier ? ("-" + coords.classifier) : '') + '.jar')
}

function getSearchUrl(groupId, artifactId, version, classifier) {
  let repository = version.toLowerCase().includes("snapshot") ? "snapshots" : "releases";
  return `https://oss.sonatype.org/service/local/artifact/maven/redirect?r=${repository}&g=${groupId}&a=${artifactId}&v=${version}` + (classifier ?
    `&c=${classifier}` : ``);
}


async function installServiceIfRequired(serviceName, updateInstallCallback) {
  const doesExist = await isServiceInstalled(serviceName);
  if (!doesExist) {
    await installJar(serviceName, updateInstallCallback);
  }
}

async function isServiceInstalled(serviceName) {
  let jarPath = getJarPath(serviceName);
  return fileExists(jarPath);
}

// Installs a jar using maven coordinates
async function installJar(serviceName, updateInstallCallback) {
  let coords = getJavaCoords(serviceName);
  let jarPath = getJarPath(serviceName);
  let jarHome = getJarHome();

  var doesExist = await fileExists(jarHome);
  if (!doesExist) {
    fs.mkdirSync(home, { recursive: true });
  }

  await updateInstallCallback(`installing ${serviceName}`);
  const setupInfo = await setupDownload(getSearchUrl(coords.groupId, coords.artifactId, coords.version, coords.classifier), serviceName, updateInstallCallback);
  await DownloadFile(setupInfo.serverDownloadUrl, jarPath, setupInfo.provideInstallStatus, setupInfo.serverDownloadSize);
 
  doesExist = await fileExists(jarPath);
  if (!doesExist) {
    throw Error(`Failed to install ${serviceName}`);
  }

  await updateInstallCallback(`installed ${serviceName}`)
}

function setupDownload(url, serviceName, updateInstallCallback) {
  return new Promise((resolve, reject) => {
    request(url, { followRedirect: false, simple: false, resolveWithFullResponse: true })
      .then((response) => {
        let redirectUrl = response.headers['location'];
        request.head(redirectUrl).then((response) => {
          let length = response['content-length'];
          return { url: redirectUrl, length: length };
        })
          .then((res) => {
            const bytesToMegabytes = 1024 * 1024;
            const provideInstallStatus = (bytesDone, percent) => {
              updateInstallCallback(`CQL not ready... downloading ${serviceName} - ${Math.floor(res.length / bytesToMegabytes)} MB (${percent}% done)`)
            }

            resolve({ serverDownloadUrl: res.url, provideInstallStatus: provideInstallStatus, serverDownloadSize: res.length });
          });
      })
  });
}

function fileExists(path) {
  return new Promise(resolve => {
    fs.access(path, fs.R_OK, error => {
      resolve(!error || error.code !== 'ENOENT')
    })
  })
}

function handleJarError(error, jarPath) {
  if (error.message.includes('Invalid or corrupt jarfile')) {
    atom.notifications.addError(`Removing invalid or corrupt jarfile: ${jarPath}. Try restarting to re-download.`,
      {
        dismissable: true,
        buttons: [
          { text: 'Restart Atom', onDidClick: () => atom.reload() }
        ],
      });

    try {
      fs.unlinkSync(jarPath);
    }
    catch (e) {
      console.error(e.message)
    }
  }
}

exports.getJavaCoords = getJavaCoords;
exports.getJarPath = getJarPath;
exports.getLocalName = getLocalName;
exports.getSearchUrl = getSearchUrl;
exports.isServiceInstalled = isServiceInstalled;
exports.installServiceIfRequired = installServiceIfRequired;
exports.fileExists = fileExists;
exports.setupDownload = setupDownload;
exports.installJar = installJar;
exports.handleJarError = handleJarError;