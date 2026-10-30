/** Diagnostics are presentation data and never action execution authority. */
export const actionLogLimit=1024;
export const actionOutputStreams=['command','stdout','stderr','exit','runtime'] as const;
export type ActionLogOutput={stream:typeof actionOutputStreams[number];text:string};
export const actionLogPhases=['prepare','fetch','apply','verify','inspect'] as const;
export const actionLogLevels=['info','warning','error'] as const;
export const actionLogCodes=['phase_started','phase_completed','log_truncated','unexpected_exception',
 'action_schema_value','action_result_invalid','action_result_size','action_start_invalid',
 'action_start_expired','action_cancelled','action_package_file','action_inspection_invalid',
 'message','parameter','message_size'] as const;
export type ActionLogCode=typeof actionLogCodes[number];
export type ActionLogRecord={sequence:number;phase:typeof actionLogPhases[number];level:typeof actionLogLevels[number]}&
 ({message:import('../skills/package-types').PackageReason;code?:never;output?:never}|{code:ActionLogCode;message?:never;output?:never}|{output:ActionLogOutput;code?:never;message?:never});
export type ActionLogRow={id:string;at:string;level:typeof actionLogLevels[number];
 phase:string;message:string|null;code:ActionLogCode|null;stage:string|null;output?:ActionLogOutput|null};
