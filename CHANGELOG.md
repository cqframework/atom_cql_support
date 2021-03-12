# Release Notes

## 2.9.1 - Bug Fixes

* Fixed install status not showing in status bar
* Fixed failing to run cql in empty directory

## 2.9.0 - Performance Enhancements

* Update to CQL Evaluator 1.2.0-SNAPSHOT
  * Added batch mode for test cases - big performance increase for libraries with lots of test cases
  * Cleaned up CQL output to show IDs for resource
* Update to CQL Language Server 1.5.2-SNAPSHOT
  * Added (incomplete, not yet functional) support for debug API
* Added highlighting for ELM
* Added additional logging and parallel initialization on plugin start
* Added split-pane for evaluation results
* Fixed evaluation results taking focus
* Fixed errors not being shown during execution
* Fixed CQL commands showing up in non-CQL files
  * Fixed f5 hotkey being bound in non-CQL files

## 2.8.3 - Minor Updates

* Update to CQL Evaluator 1.1.0
* Added better error notifications and status updates during initialization

## 2.8.2 - Java 8

* Reduced minimum Java version required to 1.8 [#15](https://github.com/cqframework/atom_cql_support/issues/15)
* Fix version detection for 4-part versions [#25](https://github.com/cqframework/atom_cql_support/issues/25)
* Removed developer options from plugin (non-developers were checking it) [#21](https://github.com/cqframework/atom_cql_support/issues/21)

## 2.8.1 - Bug Fixes

* Fix path handling on Windows

## 2.8.0 - Support for CQL 1.5

* Update to CQL Language Server 1.5.0-SNAPSHOT
  * Initial Support for CQL 1.5
  * Fixes some crashes
  * Fixed not starting on Java 8

* Update to CQL Evaluator 1.1.0-SNAPSHOT
  * Performance Enhancements

* Added F5 hotkey for CQL evaluation

* Fixed race condition when switching between tabs
* Fixed duplicate logging of language server errors

## 2.7.0 - Evaluation enhancements

* Update to CQL Evaluator 1.0.0-SNAPSHOT
  * Support for FHIR XML files
  * Support for Bundled Resources

* Update to CQL Language Server 1.4.0-SNAPSHOT

## 2.0.0 - Add Local Evaluation

* Right click on an open CQL editor and select CQL -> Execute

## 1.0.0 - Support for Clinical Quality Language DSTU

* Updates to support the grammar of the final CQL DSTU publication
* Fix deprecation warnings in Atom package structure

## 0.1.1 - Bug Fixes

* Fix syntax highlighting for AgeInX
* Fix syntax highlighting for time units not in timing phrases
* Update README with more information and a screenshot

## 0.1.0 - First Release

* Initial support for CQL highlighting based on DSTU ballot specification
