export interface ExportQueue {
  dispatch(jobId: string): Promise<void>;
}
