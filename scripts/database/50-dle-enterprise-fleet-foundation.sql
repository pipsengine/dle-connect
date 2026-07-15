/*
  DLE_Enterprise Logistics & Fleet foundation.
  Safe to re-run. The dashboard also bootstraps via ensureFleetDb() on first API use.
*/
USE [DLE_Enterprise];
GO

IF SCHEMA_ID(N'fleet') IS NULL EXEC(N'CREATE SCHEMA [fleet]');
GO

PRINT 'Fleet schema present. Application ensureFleetDb() creates/upgrades entity tables on first use.';
PRINT 'Tables: Vehicles, Drivers, Trips, Maintenance, Fuel, Compliance, Assignments, Requests, AuditTrail,';
PRINT '         Incidents, Vendors, Contracts, TelematicsEvents, CostEntries, Bootstrap';
GO
