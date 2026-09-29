'use client';
import React,{Component,useState}from'react';import Layout from'./components/Layout';import {PortalDataProvider}from'./portal-data';import Dashboard from'./pages/Dashboard';import Entry from'./pages/Entry';import Review from'./pages/Review';import Periods from'./pages/Periods';import Reports from'./pages/Reports';import CrewAssignments from'./pages/CrewAssignments';import AttendanceReconciliation from'./pages/AttendanceReconciliation';import OvtNightWork from'./pages/OvtNightWork';import OffshoreMobilization from'./pages/OffshoreMobilization';import Approvals from'./pages/Approvals';import CorrectionsAdjustments from'./pages/CorrectionsAdjustments';import Configuration from'./pages/Configuration';
const pages={'Dashboard':Dashboard,'Timesheet Entry':Entry,'Timesheet Review':Review,'Timesheet Periods':Periods,'Crew & Assignments':CrewAssignments,'Attendance Reconciliation':AttendanceReconciliation,'OVT & Night Work':OvtNightWork,'Offshore & Mobilization':OffshoreMobilization,'Approvals':Approvals,'Corrections & Adjustments':CorrectionsAdjustments,'Reports':Reports,'Configuration':Configuration};
class PortalErrorBoundary extends Component{
  constructor(props){super(props);this.state={error:null};}
  static getDerivedStateFromError(error){return{error};}
  componentDidCatch(error){console.error('[timesheet-portal]',error);}
  render(){
    if(!this.state.error)return this.props.children;
    return <div className="panel" style={{margin:24,padding:24}}><h1>Timesheet page could not be shown</h1><p>{this.state.error.message||'Unexpected error'}</p><button type="button" onClick={()=>this.setState({error:null})}>Try again</button></div>;
  }
}
export default function App(){const[page,setPage]=useState('Dashboard');const C=pages[page]||Dashboard;return <PortalDataProvider><Layout page={page} setPage={setPage}><PortalErrorBoundary key={page}><C setPage={setPage}/></PortalErrorBoundary></Layout></PortalDataProvider>}
