/** Pre-SDK3 history shapes. No new-work admission. */
export type PackageChange = {
  name:string;architecture:string;installed_version:string;candidate_version:string;
  archive_sha256:string;archive_bytes:number;installed_bytes:number;
};
export type UpgradePlan = {
  schema_version:1;action:'packages.upgrade_conservative.v1';provider_version:1;
  policy_sha256:string;state_sha256:string;sources_sha256:string;indexes_sha256:string;
  config_sha256:string;selection_sha256:string;local_sha256:string;
  packages:PackageChange[];kept_back:{name:string;architecture:string;held:boolean}[];
  download_bytes:number;unpacked_bytes:number;
};
