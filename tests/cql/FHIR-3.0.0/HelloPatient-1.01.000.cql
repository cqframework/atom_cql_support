library HelloPatient version '1.01.000'

using FHIR version '3.0.0'

valueset "Office Visit": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.464.1003.101.12.1001'

define "Plus":
    2+2

define "Minus":
    2-2

context Patient

define "Office Visits":
    [Encounter: "Office Visit"]
