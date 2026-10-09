import type { ChecklistCategory } from '@/lib/it-support/inspection-types';

export type InspectionLocationTemplate = {
  locationId: string;
  name: string;
  frequency: 'Monthly' | 'Quarterly';
  categories: ChecklistCategory[];
};

const item = (id: string, name: string, description: string) => ({ id, name, description });
const cat = (id: string, name: string, items: Array<{ id: string; name: string; description: string }>): ChecklistCategory => ({
  id,
  name,
  items,
});

export const INSPECTION_LOCATION_TEMPLATES: InspectionLocationTemplate[] = [
  {
    locationId: 'loc-1',
    name: 'IT Offices',
    frequency: 'Monthly',
    categories: [
      cat('cat-1-1', 'Housekeeping', [
        item('item-1-1-1', 'Workstations are clean and organized', 'Verify all workstations are free from clutter and properly maintained'),
        item('item-1-1-2', 'No unnecessary materials stored under desks', 'Check under-desk storage for compliance'),
        item('item-1-1-3', 'Walkways are free from obstruction', 'Ensure clear egress paths'),
      ]),
      cat('cat-1-2', 'Electrical Safety', [
        item('item-1-2-1', 'No exposed wiring', 'Check for any exposed or damaged electrical wires'),
        item('item-1-2-2', 'No overloaded extension sockets', 'Verify power strips and outlets are not overloaded'),
        item('item-1-2-3', 'No damaged power outlets', 'Inspect all power outlets for damage'),
      ]),
      cat('cat-1-3', 'Emergency Preparedness', [
        item('item-1-3-1', 'Emergency exits are accessible', 'Ensure all emergency exits are unobstructed'),
        item('item-1-3-2', 'Evacuation routes are clearly marked', 'Verify evacuation maps are posted and visible'),
        item('item-1-3-3', 'Fire extinguishers are available and accessible', 'Check fire extinguisher placement and accessibility'),
      ]),
      cat('cat-1-4', 'Ergonomics', [
        item('item-1-4-1', 'Proper seating arrangements', 'Verify chairs are ergonomically adjusted'),
        item('item-1-4-2', 'Monitor positioning', 'Check monitor height and distance'),
        item('item-1-4-3', 'Keyboard and mouse placement', 'Verify proper positioning to prevent strain'),
      ]),
      cat('cat-1-5', 'Environmental Conditions', [
        item('item-1-5-1', 'Adequate lighting', 'Verify lighting levels are sufficient'),
        item('item-1-5-2', 'Proper ventilation', 'Check airflow and air quality'),
        item('item-1-5-3', 'Acceptable temperature levels', 'Verify temperature within comfort range'),
      ]),
      cat('cat-1-6', 'Compliance Checks', [
        item('item-1-6-1', 'ISO 45001 compliance', 'Verify health and safety compliance'),
        item('item-1-6-2', 'ISO 14001 compliance', 'Verify environmental compliance'),
        item('item-1-6-3', 'IT policies followed', 'Check adherence to IT policies'),
        item('item-1-6-4', 'IMS procedures followed', 'Verify IMS procedure compliance'),
        item('item-1-6-5', 'Regulatory requirements met', 'Check legal and regulatory compliance'),
      ]),
    ],
  },
  {
    locationId: 'loc-2',
    name: 'Server Rooms',
    frequency: 'Monthly',
    categories: [
      cat('cat-2-1', 'Access Control', [
        item('item-2-1-1', 'Door access control functioning', 'Verify biometric/card access working'),
        item('item-2-1-2', 'Access logs maintained', 'Check access log documentation'),
        item('item-2-1-3', 'Unauthorized access prevented', 'Verify security measures active'),
      ]),
      cat('cat-2-2', 'Environmental Controls', [
        item('item-2-2-1', 'Temperature maintained between approved limits', 'Check temperature sensors and readings'),
        item('item-2-2-2', 'Humidity within acceptable range', 'Verify humidity levels'),
        item('item-2-2-3', 'Air-conditioning operational', 'Check HVAC system status'),
      ]),
      cat('cat-2-3', 'Fire Protection', [
        item('item-2-3-1', 'Fire suppression systems operational', 'Verify fire suppression readiness'),
        item('item-2-3-2', 'Smoke detectors functioning', 'Test smoke detectors'),
        item('item-2-3-3', 'Emergency response information displayed', 'Check emergency postings'),
      ]),
      cat('cat-2-4', 'Equipment Safety', [
        item('item-2-4-1', 'Servers properly mounted', 'Verify rack mounting security'),
        item('item-2-4-2', 'Rack doors secured', 'Check rack door locks'),
        item('item-2-4-3', 'Equipment labeling maintained', 'Verify all equipment labeled'),
      ]),
    ],
  },
  {
    locationId: 'loc-3',
    name: 'Data Centers',
    frequency: 'Monthly',
    categories: [
      cat('cat-3-1', 'Infrastructure Availability', [
        item('item-3-1-1', 'Redundant power systems operational', 'Verify UPS and generator status'),
        item('item-3-1-2', 'Generator support available', 'Check generator readiness'),
        item('item-3-1-3', 'UPS systems healthy', 'Verify UPS battery health'),
      ]),
      cat('cat-3-2', 'Environmental Monitoring', [
        item('item-3-2-1', 'Temperature monitoring', 'Check temperature sensors'),
        item('item-3-2-2', 'Humidity monitoring', 'Verify humidity sensors'),
        item('item-3-2-3', 'Water leakage detection', 'Check leak detection systems'),
      ]),
      cat('cat-3-3', 'Physical Security', [
        item('item-3-3-1', 'CCTV operational', 'Verify camera coverage'),
        item('item-3-3-2', 'Access control operational', 'Check access systems'),
        item('item-3-3-3', 'Visitor controls maintained', 'Verify visitor logs'),
      ]),
      cat('cat-3-4', 'Business Continuity', [
        item('item-3-4-1', 'Backup systems operational', 'Verify backup status'),
        item('item-3-4-2', 'DR documentation updated', 'Check DR plan currency'),
        item('item-3-4-3', 'Recovery procedures available', 'Verify procedures accessible'),
      ]),
    ],
  },
  {
    locationId: 'loc-4',
    name: 'Network Cabinets',
    frequency: 'Monthly',
    categories: [
      cat('cat-4-1', 'Physical Security', [
        item('item-4-1-1', 'Cabinet doors locked', 'Verify cabinet locks secure'),
        item('item-4-1-2', 'Access restricted', 'Check unauthorized access prevention'),
      ]),
      cat('cat-4-2', 'Cable Management', [
        item('item-4-2-1', 'Cables properly routed', 'Verify cable routing'),
        item('item-4-2-2', 'Cables properly labeled', 'Check cable labels'),
        item('item-4-2-3', 'No cable congestion', 'Verify no overcrowding'),
      ]),
      cat('cat-4-3', 'Equipment Arrangement', [
        item('item-4-3-1', 'Equipment securely mounted', 'Verify mounting security'),
        item('item-4-3-2', 'Ventilation openings unobstructed', 'Check airflow'),
      ]),
    ],
  },
  {
    locationId: 'loc-5',
    name: 'UPS Rooms',
    frequency: 'Monthly',
    categories: [
      cat('cat-5-1', 'Battery Health', [
        item('item-5-1-1', 'Battery alarms reviewed', 'Check alarm status'),
        item('item-5-1-2', 'Battery replacement dates monitored', 'Verify replacement schedule'),
      ]),
      cat('cat-5-2', 'Ventilation', [
        item('item-5-2-1', 'Adequate airflow', 'Check ventilation'),
        item('item-5-2-2', 'No overheating signs', 'Verify temperature'),
      ]),
      cat('cat-5-3', 'Safety', [
        item('item-5-3-1', 'Warning signs displayed', 'Check safety signage'),
        item('item-5-3-2', 'Emergency shutdown procedures available', 'Verify procedures posted'),
      ]),
    ],
  },
  {
    locationId: 'loc-6',
    name: 'Cabling Routes',
    frequency: 'Quarterly',
    categories: [
      cat('cat-6-1', 'Cable Integrity', [
        item('item-6-1-1', 'No damaged cables', 'Inspect cables'),
        item('item-6-1-2', 'No exposed conductors', 'Check for exposed wires'),
      ]),
      cat('cat-6-2', 'Routing Compliance', [
        item('item-6-2-1', 'Proper cable trays used', 'Verify cable trays'),
        item('item-6-2-2', 'Proper cable protection in place', 'Check protection'),
      ]),
      cat('cat-6-3', 'Identification', [
        item('item-6-3-1', 'Cable labels available', 'Verify labeling'),
        item('item-6-3-2', 'Route documentation updated', 'Check documentation'),
      ]),
    ],
  },
  {
    locationId: 'loc-7',
    name: 'IT Storage Areas',
    frequency: 'Monthly',
    categories: [
      cat('cat-7-1', 'Housekeeping', [
        item('item-7-1-1', 'Area clean and organized', 'Check organization'),
        item('item-7-1-2', 'Aisle clearance maintained', 'Verify clear paths'),
        item('item-7-1-3', 'Proper labeling in place', 'Check labels'),
      ]),
      cat('cat-7-2', 'Safety', [
        item('item-7-2-1', 'Fire safety equipment accessible', 'Check fire equipment'),
        item('item-7-2-2', 'Exit access clear', 'Verify exits'),
      ]),
      cat('cat-7-3', 'Environmental', [
        item('item-7-3-1', 'Temperature within limits', 'Check temperature'),
        item('item-7-3-2', 'Humidity controlled', 'Check humidity'),
      ]),
    ],
  },
  {
    locationId: 'loc-8',
    name: 'Disaster Recovery Sites',
    frequency: 'Quarterly',
    categories: [
      cat('cat-8-1', 'Infrastructure', [
        item('item-8-1-1', 'Power backup operational', 'Check backup power'),
        item('item-8-1-2', 'Network connectivity verified', 'Verify network'),
        item('item-8-1-3', 'Cooling systems functional', 'Check cooling'),
      ]),
      cat('cat-8-2', 'Procedures', [
        item('item-8-2-1', 'DR plan documented', 'Verify DR plan'),
        item('item-8-2-2', 'Test results recorded', 'Check test records'),
        item('item-8-2-3', 'Documentation updated', 'Verify currency'),
      ]),
      cat('cat-8-3', 'Equipment', [
        item('item-8-3-1', 'Server status verified', 'Check servers'),
        item('item-8-3-2', 'Backup verification passed', 'Verify backups'),
      ]),
    ],
  },
];
