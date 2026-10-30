// SMART on FHIR settings. Edit this file, not the code.
window.SMART_CONFIG = {
  // The SMART sandbox (launch.smarthealthit.org) accepts any client ID.
  // For a real EHR, replace this with the client ID the vendor gives you
  // when you register the app (and register this site's launch.html and
  // index.html URLs as the launch and redirect URLs).
  clientId: "my_web_app",

  // Read-only access to the patient's record. These are SMART v2 scopes.
  // If a server only understands v1, use:
  //   "openid fhirUser patient/Patient.read patient/Observation.read"
  scope: "openid fhirUser patient/Patient.rs patient/Observation.rs",

  // Added only for standalone launches, so the server asks the user to
  // pick a patient. EHR launches get the "launch" scope automatically.
  standaloneScope: "launch/patient"
};