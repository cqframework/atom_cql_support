# Clinical Quality Language (CQL) Support in Atom

Adds syntax highlighting, semantic (error) highlighting, and local execution to CQL files in Atom, a free and open source editor.  

![CQL Syntax Highlighting Screenshot](https://raw.githubusercontent.com/cqframework/atom_cql_support/master/screenshot.png)

## How to Install

The [cql-language](https://atom.io/packages/language-cql) package has been
published to the Atom package repository, so installation is simple:

1. If you don't have Atom, [download](https://atom.io/) and install it.
2. Install the _cql-language_ package by follow the instructions for
   [installing packages](https://atom.io/docs/latest/customizing-atom#installing-packages)
   a. The _cql-language_ package requires both a Java v1.8 runtime and a correct Java Path.
   If the installation fails to detect either, you will be prompted to download and install Java and/or set a correct Java Path.

## Using the CQL support in Atom

After you've installed the _cql-language_ package, open any _.cql_ file in Atom.
As long as the file has the _.cql_ extension, syntax and error highlighting will be
automatically applied.

To execute CQL right-click in the CQL Editor Windows and select `CQL -> Execute` or press `F5`

The translation and execution capabilities in the plugin expect CQL files to be in the following directories, by convention:

```bash
input/cql
input/tests
input/tests/<cql-library-name>
input/tests/<cql-library-name>/<patient-id>
input/tests/<cql-library-name>/<patient-id>/<resource-type-name>/<resource files> // flexible structure
input/vocabulary/codesystem
input/vocabulary/valueset
```

Within the tests folder, there is a folder for each CQL library, by name (note that the name of the file _must_ match the name of the library in order for the evaluator to properly execute the CQL). Note also that the evaluator is a separate subsystem from the translator, so it will read whatever is current of off disk, so be sure to save before executing.

Within the library folder, there is a folder for each "test case", in the form of a Patient (the execution only supports patient context execution at this point). The folder must have the same id as the patient (that's how the evaluator knows what the patient id is).

Within each test case folder are the resources for that specific test case. The resource files can be provided either directly in this folder, or they can be organized into folders by resource type name. Whether they are in the test folder or in subfolders, resources can be provided as bundles (included nested bundles), or as separate files, and in either XML or JSON format. If a Patient is provided, the id element of the Patient resource must match the name of the test case folder.

## More About the Clinical Quality Language

The Clinical Quality Language (CQL) is a domain specific language for expressing
electronic clinical quality measures (eCQM) and clinical decision support rules
(CDS) in an author-friendly computable format. Find out more about CQL:

* [CQL Specification](http://cql.hl7.org)
* [CQL Stream on FHIR Zulip Chat](https://chat.fhir.org/#narrow/stream/179220-cql)
* [clinical_quality_language on GitHub](https://github.com/cqframework/clinical_quality_language)
* [Clinical Quality Expression Language at HL7](http://www.hl7.org/special/Committees/projman/searchableProjectIndex.cfm?action=view&ProjectNumber=1108)
* [Clinical Quality Framework (CQF)](https://confluence.hl7.org/display/CQIWC/Clinical+Quality+Framework)

## Local Plugin Development

* uninstall the language-cql package from Atom if you have it installed
* run `yarn install` in the root directory to install dependencies
* run `apm link` to create a symbolic link from the git directories to the working directory
  * working directory can be found at `<user dir>\.atom\packages\language-cql`
* reload workspace to get updates (ctr-shift-f5)

## License

Copyright 2014 - 2015 The MITRE Corporation

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

<http://www.apache.org/licenses/LICENSE-2.0>

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
