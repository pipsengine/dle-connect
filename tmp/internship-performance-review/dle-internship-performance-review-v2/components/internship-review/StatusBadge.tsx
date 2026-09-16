export default function StatusBadge({status}:{status:string}){return <span className={'status s-'+status.toLowerCase().replaceAll(' ','-')}>{status}</span>}
