/**
 * Complex Radio Communication System Example
 * Demonstrates:
 * - Multiple interfaces (Data, Power)
 * - Flow properties
 * - Physical & Functional Requirements
 * - Traceability
 */

export const RADIO_SYSTEM_EXAMPLE = `package 'Radio Communication System' {
	
	// --- Requirements ---
	
	package 'Requirements' {
		requirement def FunctionalReq {
			doc /* The system shall provide reliable voice and data communication. */
		}
		
		requirement def PhysicalReq {
			doc /* The system components shall be ruggedized for outdoor use. */
		}
		
		requirement def PerformanceReq {
			doc /* Latency shall be less than 50ms. */
			attribute maxLatency : Real = 50.0;
		}
		
		requirement def InterfaceReq {
			doc /* All external interfaces shall use standard protocols. */
		}
	}
	
	import Requirements::*;

	// --- Definitions ---
	
	// Interfaces
	interface def DataLink {
		end p1;
		end p2;
		flow p1 to p2 : DataMessage;
		flow p2 to p1 : ControlSignal;
	}
	
	interface def PowerInterface {
		end source;
		end sink;
		flow source to sink : Power;
		attribute voltage : Real = 24.0;
	}
	
	attribute def DataMessage;
	attribute def ControlSignal;
	attribute def Power;

	// Components
	part def User {
		port audioIn;
		port audioOut;
	}
	
	part def RadioBaseStation {
		satisfy FunctionalReq;
		
		port antenna;
		port networkInterface;
		
		attribute coverageRadius : Real = 10.0; // km
	}
	
	part def OnBoardController {
		satisfy PhysicalReq;
		satisfy PerformanceReq;
		
		port radioInterface;
		port vehicleBus;
		port powerInput;
		
		part radioModule : RadioModule;
		part processor : CPU;
	}
	
	part def WaysideHeadend {
		port fiberBackhaul;
		port powerOutput;
	}
	
	part def RadioModule;
	part def CPU;

	// --- System Structure ---
	
	part def CommunicationSystem {
		// Parts
		part dispatcher : User;
		part trainOperator : User;
		
		part baseStation : RadioBaseStation;
		part wayside : WaysideHeadend;
		
		part trainRadio : OnBoardController;
		
		// Internal Structure & Connections
		
		// RF Link (Logical)
		connect baseStation.antenna to trainRadio.radioInterface;
		
		// Wayside to Base Station (Backhaul)
		connect wayside.fiberBackhaul to baseStation.networkInterface;
		
		// Power Distribution
		connect wayside.powerOutput to trainRadio.powerInput; // Conceptual power feed
		
		// User Interfaces
		connect dispatcher to baseStation; // Logical association
		connect trainOperator to trainRadio;
		
		// Traceability
		verify PerformanceReq;
	}
	
	// --- Analysis ---
	
	analysis def LatencyAnalysis {
		subject system : CommunicationSystem;
		return totalLatency : Real;
	}
}
`;
