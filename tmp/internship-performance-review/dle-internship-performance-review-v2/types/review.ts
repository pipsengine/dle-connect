export type ReviewStatus='Draft'|'Assigned'|'In Evaluation'|'Pending HOD'|'Pending HR Manager'|'Pending MD'|'Returned'|'Approved'|'HR Action'|'Closed';
export type Rating=1|2|3|4|5; export type Role='HR'|'LINE_MANAGER'|'HOD'|'HR_MANAGER'|'MD';
export interface Employee{code:string;name:string;department:string;jobTitle:string;email:string;internshipStart:string;lineManager:string;hod?:string}
export interface Score{criterion:string;rating:Rating;comment?:string}
export interface Approval{step:string;approver:string;role:Role;status:'Pending'|'Approved'|'Returned'|'Skipped';comment?:string;at?:string}
export interface Review{id:string;employee:Employee;cycle:string;dueDate:string;status:ReviewStatus;supervisor:string;scores:Score[];strength:string;improvement:string;impression:string;recommendation:''|'Yes'|'No'|'Extend internship';overall:number;approvals:Approval[];hrAction?:string;hrActionNotes?:string;createdAt:string;updatedAt:string}