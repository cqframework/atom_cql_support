const { DownloadFile } = require('atom-languageclient');
const fs = require('fs');

const request = require('request-promise-native');
const path = require('path');

// function getJavaCoords(serviceName) {
//   const coords = {
//     groupId: packagejson[serviceName].groupId,
//     artifactId: packagejson[serviceName].artifactId,
//     version: packagejson[serviceName].version,
//     classifier: packagejson[serviceName].classifier
//   };

//   return coords;
// };

function getJarHome() {
  return path.join(__dirname, '../../..', 'jars');
}

function getServicePath(coords) {
  const jarHome = getJarHome();
  const jarName = getLocalName(coords);
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


async function installJavaDependencies(coordsMaps, updateInstallCallback) {
  for (const [key, value] of Object.entries(coordsMaps)) {
    await installServiceIfRequired(key, value, updateInstallCallback);
  }
}


async function installServiceIfRequired(serviceName, coords, updateInstallCallback) {
  const doesExist = await isServiceInstalled(coords);
  if (!doesExist) {

    await updateInstallCallback(`installing ${serviceName}`);
    let notification = atom.notifications.addInfo(`Downloading and installing ${serviceName}.`, { detail: "Check the status bar for download progress" });

    try {
      await installJar(serviceName, coords, updateInstallCallback);
      await updateInstallCallback(`installed ${serviceName}`)
      notification.dismiss();
      notification = atom.notifications.addSuccess(`Installed ${serviceName}.`);

    }
    catch (e) {
      notification.dismiss();
      await updateInstallCallback(`installation failed for ${serviceName}`);
      atom.notifications.addError(`Failed to install ${serviceName}.`, { detail: (e && e.message) ? e.message : "Unknown error.", dismissable: true })
      throw e;
    }
  }
}

async function isServiceInstalled(coords) {
  let jarPath = getServicePath(coords);
  return fileExists(jarPath);
}

// Installs a jar using maven coordinates
async function installJar(serviceName, coords, updateInstallCallback) {
  let jarPath = getServicePath(coords);
  let jarHome = getJarHome();

  var doesExist = await fileExists(jarHome);
  if (!doesExist) {
    fs.mkdirSync(jarHome, { recursive: true });
  }

  const setupInfo = await setupDownload(getSearchUrl(coords.groupId, coords.artifactId, coords.version, coords.classifier), serviceName, updateInstallCallback);
  await DownloadFile(setupInfo.serverDownloadUrl, jarPath, setupInfo.provideInstallStatus, setupInfo.serverDownloadSize);

  doesExist = await fileExists(jarPath);
  if (!doesExist) {
    throw Error(`Failed to install ${serviceName}`);
  }
}

async function setupDownload(url, serviceName, updateInstallCallback) {
  let response = await request(url, { followRedirect: false, simple: false, resolveWithFullResponse: true });
  let redirectUrl = response.headers['location'];

  if (!redirectUrl || redirectUrl == '') {
    throw new Error(`Unable to locate and/or download files for ${serviceName}`);
  }

  response = await request.head(redirectUrl);
  let length = response['content-length'];
  const bytesToMegabytes = 1024 * 1024;
  const provideInstallStatus = (bytesDone, percent) => {
    updateInstallCallback(`downloading ${serviceName} - ${Math.floor(length / bytesToMegabytes)} MB (${percent}% done)`);
  }

  return { serverDownloadUrl: redirectUrl, provideInstallStatus: provideInstallStatus, serverDownloadSize: length };
}

function fileExists(path) {
  return new Promise(resolve => {
    fs.access(path, fs.R_OK, error => {
      resolve(!error || error.code !== 'ENOENT')
    })
  })
}

function handleJarError(error, jarPath) {
  const errorLower = error.message.toLowerCase();
  if (errorLower.includes('corrupt') || errorLower.includes('invalid')) {

    try {
      fs.unlinkSync(jarPath);
    }
    catch (e) {
      console.error(e.message)
    }

    atom.notifications.addError(`Removed invalid or corrupt file: ${jar}. Try restarting to re-download.`,
      {
        dismissable: true,
        buttons: [
          { text: 'Restart Atom', onDidClick: () => atom.reload() }
        ],
      });
  }
  else {
    atom.notifications.addError(`Error attempting to install: ${jar} Try restarting to re-download.`,
      {
        dismissable: true,
        buttons: [
          { text: 'Restart Atom', onDidClick: () => atom.reload() }
        ],
      });
  }
}

exports.getServicePath = getServicePath;
exports.installServiceIfRequired = installServiceIfRequired;
exports.handleJarError = handleJarError;
exports.installJavaDependencies = installJavaDependencies;