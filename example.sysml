package SETailoringFramework {
    doc
    /*
     * Systems Engineering Tailoring Framework
     * 
     * A metrics-driven framework for tailoring ISO/IEC/IEEE 15288:2023 
     * systems engineering processes across three modular levels.
     * 
     * @version 3.1
     * @standard ISO/IEC/IEEE 15288:2023
     * @reference INCOSE Systems Engineering Handbook
     */

    private import ScalarValues::*;
    private import SI::*;
    
    // ============================================
    // SECTION 1: CORE TYPE DEFINITIONS
    // ============================================
    
    package CoreTypes {
        doc /* Core type definitions for the tailoring framework */;
        
        enumeration def TailoringLevel {
            doc 
            /*
             * Three-level tailoring hierarchy for SE processes.
             * 
             * Principle: "Never Zero" - Every process is present at every level.
             * Basic does not mean "no SE"; it means minimal explicit structure.
             */;
            
            Basic {
                doc 
                /*
                 * Minimal explicit implementation with essential activities 
                 * embedded in natural workflows.
                 * 
                 * Target: Low-risk, simple projects
                 * Culture: Resistant organizations
                 * Documentation: Minimal templates, spreadsheet-based
                 */;
            }
            Standard {
                doc 
                /*
                 * Normal implementation with moderate rigor and 
                 * structured documentation.
                 * 
                 * Target: Medium-complexity projects
                 * Culture: Tolerant organizations
                 * Documentation: Structured templates, requirements databases
                 */;
            }
            Comprehensive {
                doc 
                /*
                 * Full implementation with maximum rigor, traceability, 
                 * and formality.
                 * 
                 * Target: High-risk, complex, safety-critical projects
                 * Culture: Supportive organizations
                 * Documentation: MBSE/digital thread, complete traceability
                 */;
            }
        }
        
        enumeration def OrganizationalCulture {
            doc 
            /*
             * Organizational culture classification from Simplified SE.
             * Maps to tailoring levels for adoption strategy guidance.
             */;
            
            Resistant {
                doc /* SE viewed as overhead; requires invisible integration */;
            }
            Tolerant {
                doc /* Open to SE with demonstrated value */;
            }
            Supportive {
                doc /* Actively supports SE practices */;
            }
        }
        
        enumeration def ProcessGroup {
            doc /* ISO 15288 process group classification */;
            
            Agreement { doc /* Acquisition and Supply processes */; }
            OrganizationalEnabling { doc /* 6 organizational processes */; }
            TechnicalManagement { doc /* 8 technical management processes */; }
            Technical { doc /* 14 technical processes */; }
        }
        
        enumeration def AssessmentDimension {
            doc /* Four-dimensional quantitative assessment framework */;
            
            SystemComplexity { doc /* M1-M4: Architectural, Interface, Technology, Integration */; }
            SafetyCriticality { doc /* M5-M8: Safety, Mission, Environmental, Regulatory */; }
            ProjectConstraints { doc /* M9-M12: Schedule, Budget, Experience, Distribution */; }
            StakeholderContext { doc /* M13-M16: Count, Volatility, Political, Culture */; }
        }
    }
    
    // ============================================
    // SECTION 2: ASSESSMENT METHODOLOGY
    // ============================================
    
    package AssessmentMethodology {
        doc /* 16-metric quantitative assessment methodology */;
        
        import CoreTypes::*;
        
        part def AssessmentMetric {
            doc 
            /*
             * Individual assessment metric with 1-5 ordinal scale.
             * 
             * Scoring Philosophy: Metrics are decision aids, not 
             * statistically rigorous indices. They promote consistent, 
             * transparent, and justifiable tailoring decisions.
             */;
            
            attribute id : String;
            attribute name : String;
            attribute description : String;
            attribute dimension : AssessmentDimension;
            attribute score : Integer(1..5);
            
            constraint validScore {
                score >= 1 and score <= 5
            }
        }
        
        part def DimensionScore {
            doc /* Aggregated score for a single dimension */;
            
            attribute dimension : AssessmentDimension;
            attribute averageScore : Real;
            attribute weight : Real;
            
            constraint validWeight {
                weight >= 0.0 and weight <= 1.0
            }
        }
        
        part def ProjectAssessment {
            doc 
            /*
             * Complete project assessment with 16 metrics.
             * 
             * Who scores: Project Manager + Lead Systems Engineer collaboratively.
             * For Standard+ projects: Sponsor involvement recommended.
             * For M3>=4 or M5>=4: Domain SMEs should participate.
             */;
            
            attribute projectId : String;
            attribute assessmentDate : String;
            
            part metrics : AssessmentMetric[16];
            part dimensionScores : DimensionScore[4];
            
            attribute compositeScore : Real;
            attribute baselineLevel : TailoringLevel;
            attribute organizationalCulture : OrganizationalCulture;
            
            // Default weights for transit/infrastructure projects
            constraint dimensionWeights {
                dimensionScores->select(d | d.dimension = AssessmentDimension::SystemComplexity).weight = 0.25 and
                dimensionScores->select(d | d.dimension = AssessmentDimension::SafetyCriticality).weight = 0.30 and
                dimensionScores->select(d | d.dimension = AssessmentDimension::ProjectConstraints).weight = 0.20 and
                dimensionScores->select(d | d.dimension = AssessmentDimension::StakeholderContext).weight = 0.25
            }
            
            // Tailoring level thresholds
            constraint levelThresholds {
                (compositeScore >= 1.0 and compositeScore <= 2.4) implies baselineLevel = TailoringLevel::Basic and
                (compositeScore >= 2.5 and compositeScore <= 3.9) implies baselineLevel = TailoringLevel::Standard and
                (compositeScore >= 4.0 and compositeScore <= 5.0) implies baselineLevel = TailoringLevel::Comprehensive
            }
        }
        
        part def MandatoryOverride {
            doc 
            /*
             * Mandatory override conditions that elevate tailoring level
             * regardless of composite score.
             */;
            
            attribute triggerMetric : String;
            attribute triggerValue : Integer;
            attribute affectedProcesses : String[*];
            attribute minimumLevel : TailoringLevel;
            
            // Pre-defined overrides
            static part safetyCriticalOverride : MandatoryOverride {
                :>> triggerMetric = "M5";
                :>> triggerValue = 4;
                :>> affectedProcesses = {"Verification", "Validation", "QualityAssurance"};
                :>> minimumLevel = TailoringLevel::Standard;
            }
            
            static part lifeSafetyOverride : MandatoryOverride {
                :>> triggerMetric = "M5";
                :>> triggerValue = 5;
                :>> affectedProcesses = {"Requirements", "Verification", "Validation", "QualityAssurance"};
                :>> minimumLevel = TailoringLevel::Comprehensive;
            }
            
            static part missionCriticalOverride : MandatoryOverride {
                :>> triggerMetric = "M6";
                :>> triggerValue = 4;
                :>> affectedProcesses = {"Architecture", "RiskManagement"};
                :>> minimumLevel = TailoringLevel::Standard;
            }
            
            static part regulatoryOverride : MandatoryOverride {
                :>> triggerMetric = "M8";
                :>> triggerValue = 4;
                :>> affectedProcesses = {"ConfigurationManagement", "InformationManagement"};
                :>> minimumLevel = TailoringLevel::Standard;
            }
        }
    }
    
    // ============================================
    // SECTION 3: PROCESS DEFINITIONS
    // ============================================
    
    package ProcessDefinitions {
        doc /* ISO 15288 process definitions with tailoring levels */;
        
        import CoreTypes::*;
        import AssessmentMethodology::*;
        
        metadata def ProcessMetadata {
            doc /* Metadata for process documentation */;
            
            attribute version : String;
            attribute author : String;
            attribute lastUpdated : String;
            attribute iso15288Clause : String;
            attribute incoseReference : String;
        }
        
        abstract part def ProcessElement {
            doc /* Base class for all process elements */;
            
            attribute name : String;
            attribute description : String;
        }
        
        part def ProcessInput :> ProcessElement {
            doc /* Process input with source traceability */;
            
            attribute sourceProcess : String;
            attribute sourceLevel : TailoringLevel;
            attribute sourceArtifact : String;
        }
        
        part def ProcessActivity :> ProcessElement {
            doc /* Process activity definition */;
            
            attribute tailoringLevel : TailoringLevel;
            attribute sequence : Integer;
        }
        
        part def ProcessDeliverable :> ProcessElement {
            doc /* Process deliverable/artifact */;
            
            attribute tailoringLevel : TailoringLevel;
            attribute format : String;
        }
        
        part def ProcessOutput :> ProcessElement {
            doc /* Process output with downstream traceability */;
            
            attribute targetProcess : String;
            attribute targetLevel : TailoringLevel;
        }
        
        abstract part def ISO15288Process {
            doc 
            /*
             * Abstract base for all ISO 15288 processes.
             * 
             * Module Structure (NEC-inspired):
             * - Definition per level
             * - Inputs with source traceability
             * - Activities per level
             * - Key Artifacts/Deliverables per level
             * - Outputs with downstream traceability
             */;
            
            attribute processId : Integer;
            attribute processName : String;
            attribute processGroup : ProcessGroup;
            attribute purpose : String;
            
            part inputs : ProcessInput[*];
            part activities : ProcessActivity[*];
            part deliverables : ProcessDeliverable[*];
            part outputs : ProcessOutput[*];
            
            abstract part levelDefinitions {
                part basic : ProcessLevelDefinition;
                part standard : ProcessLevelDefinition;
                part comprehensive : ProcessLevelDefinition;
            }
        }
        
        part def ProcessLevelDefinition {
            doc /* Process definition for a specific tailoring level */;
            
            attribute level : TailoringLevel;
            attribute definition : String;
            attribute philosophy : String;
            attribute targetContext : String;
            attribute characteristics : String[*];
            attribute documentationStance : String;
            attribute cultureAlignment : OrganizationalCulture;
        }
        
        // Example: Risk Management Process
        part def RiskManagementProcess :> ISO15288Process {
            @ProcessMetadata {
                version = "3.1";
                author = "SE Framework Team";
                lastUpdated = "2025-02-18";
                iso15288Clause = "6.3.4";
                incoseReference = "SE Handbook Chapter 14";
            }
            
            doc 
            /*
             * Risk Management Process (ISO 15288 Process 12)
             * 
             * Purpose: Identify, assess, and treat risks throughout 
             * the system lifecycle.
             * 
             * Priority: Included in "Starter Set" for all projects
             */;
            
            :>> processId = 12;
            :>> processName = "Risk Management";
            :>> processGroup = ProcessGroup::TechnicalManagement;
            :>> purpose = "Identify, assess, and treat risks throughout the system lifecycle";
            
            part override levelDefinitions {
                part basic : ProcessLevelDefinition {
                    :>> level = TailoringLevel::Basic;
                    :>> definition = "Simple risk identification and tracking with basic mitigation actions";
                    :>> philosophy = "Focus on visible risks with practical mitigation";
                    :>> targetContext = "Low-risk projects with well-understood scope";
                    :>> characteristics = {"Simple risk register", "Basic probability/impact assessment", "Informal review"};
                    :>> documentationStance = "Spreadsheet-based risk register";
                    :>> cultureAlignment = OrganizationalCulture::Resistant;
                }
                
                part standard : ProcessLevelDefinition {
                    :>> level = TailoringLevel::Standard;
                    :>> definition = "Structured risk management with formal assessment and treatment planning";
                    :>> philosophy = "Systematic risk identification with quantified assessment";
                    :>> targetContext = "Medium-risk projects with multiple risk categories";
                    :>> characteristics = {"Formal risk register", "Quantitative assessment", "Treatment plans", "Regular reviews"};
                    :>> documentationStance = "Risk management plan with database tracking";
                    :>> cultureAlignment = OrganizationalCulture::Tolerant;
                }
                
                part comprehensive : ProcessLevelDefinition {
                    :>> level = TailoringLevel::Comprehensive;
                    :>> definition = "Comprehensive risk framework with continuous monitoring and advanced analysis";
                    :>> philosophy = "Proactive risk management with predictive capabilities";
                    :>> targetContext = "High-risk, complex projects with safety implications";
                    :>> characteristics = {"Risk management framework", "Monte Carlo analysis", "Continuous monitoring", "Risk dashboards"};
                    :>> documentationStance = "Full risk management system with MBSE integration";
                    :>> cultureAlignment = OrganizationalCulture::Supportive;
                }
            }
        }
    }
    
    // ============================================
    // SECTION 4: INTERDEPENDENCY FRAMEWORK
    // ============================================
    
    package Interdependencies {
        doc /* Process interdependency matrix and consistency rules */;
        
        import CoreTypes::*;
        import ProcessDefinitions::*;
        
        part def InterdependencyRule {
            doc 
            /*
             * Rule governing process interdependencies.
             * 
             * Ensures consistency in tailoring decisions across
             * related processes.
             */;
            
            attribute ruleId : String;
            attribute description : String;
            attribute sourceProcess : String;
            attribute targetProcess : String;
            attribute constraintType : String; // "elevation", "minimum", "consistency"
            attribute rationale : String;
        }
        
        part def InterdependencyMatrix {
            doc /* Complete interdependency matrix for all 30 processes */;
            
            part rules : InterdependencyRule[*];
            
            // Seven core consistency rules
            static part rule1 : InterdependencyRule {
                :>> ruleId = "R1";
                :>> description = "Requirements level cannot exceed Architecture level";
                :>> sourceProcess = "System Requirements Definition";
                :>> targetProcess = "System Architecture Definition";
                :>> constraintType = "consistency";
                :>> rationale = "Architecture must be sufficiently rigorous to support requirements traceability";
            }
            
            static part rule2 : InterdependencyRule {
                :>> ruleId = "R2";
                :>> description = "Verification level cannot be less than Requirements level";
                :>> sourceProcess = "Verification";
                :>> targetProcess = "System Requirements Definition";
                :>> constraintType = "elevation";
                :>> rationale = "Verification rigor must match requirements formality";
            }
            
            static part rule3 : InterdependencyRule {
                :>> ruleId = "R3";
                :>> description = "Configuration Management level cannot be less than Design level";
                :>> sourceProcess = "Configuration Management";
                :>> targetProcess = "Design Definition";
                :>> constraintType = "elevation";
                :>> rationale = "Design artifacts require corresponding CM control";
            }
            
            static part rule4 : InterdependencyRule {
                :>> ruleId = "R4";
                :>> description = "Integration level cannot be less than Architecture level";
                :>> sourceProcess = "Integration";
                :>> targetProcess = "System Architecture Definition";
                :>> constraintType = "elevation";
                :>> rationale = "Integration complexity must match architectural decomposition";
            }
            
            static part rule5 : InterdependencyRule {
                :>> ruleId = "R5";
                :>> description = "Validation level cannot be less than Stakeholder Needs level";
                :>> sourceProcess = "Validation";
                :>> targetProcess = "Stakeholder Needs and Requirements Definition";
                :>> constraintType = "elevation";
                :>> rationale = "Validation rigor must match stakeholder needs formality";
            }
            
            static part rule6 : InterdependencyRule {
                :>> ruleId = "R6";
                :>> description = "Quality Assurance level cannot be less than Project Assessment level";
                :>> sourceProcess = "Quality Assurance";
                :>> targetProcess = "Project Assessment and Control";
                :>> constraintType = "elevation";
                :>> rationale = "QA must support project assessment rigor";
            }
            
            static part rule7 : InterdependencyRule {
                :>> ruleId = "R7";
                :>> description = "Risk Management level cannot be less than Project Planning level";
                :>> sourceProcess = "Risk Management";
                :>> targetProcess = "Project Planning";
                :>> constraintType = "elevation";
                :>> rationale = "Risk management must support planning complexity";
            }
        }
        
        action def CheckInterdependencyConsistency {
            doc /* Action to validate tailoring consistency across processes */;
            
            in projectAssessment : ProjectAssessment;
            in processTailoring : ProcessTailoringDecision[*];
            out consistencyReport : ConsistencyReport;
            
            // Validate all interdependency rules
            action validateRules {
                out violations : String[*];
            }
            
            action generateReport {
                in violations : String[*];
                out report : ConsistencyReport;
            }
        }
        
        part def ProcessTailoringDecision {
            doc /* Tailoring decision for a single process */;
            
            attribute processId : Integer;
            attribute processName : String;
            attribute determinedLevel : TailoringLevel;
            attribute overrideApplied : Boolean;
            attribute overrideReason : String;
            attribute consistencyCheckPassed : Boolean;
        }
        
        part def ConsistencyReport {
            doc /* Report on interdependency consistency */;
            
            attribute isConsistent : Boolean;
            attribute violations : String[*];
            attribute recommendedAdjustments : String[*];
        }
    }
    
    // ============================================
    // SECTION 5: CULTURE INTEGRATION
    // ============================================
    
    package CultureIntegration {
        doc /* Organizational culture integration for adoption strategy */;
        
        import CoreTypes::*;
        
        part def CultureAssessment {
            doc /* Assessment of organizational culture for SE adoption */;
            
            attribute cultureType : OrganizationalCulture;
            attribute diagnosticScore : Real;
            
            part adoptionStrategy : AdoptionStrategy;
        }
        
        part def AdoptionStrategy {
            doc /* Strategy for implementing SE at the determined level */;
            
            attribute cultureType : OrganizationalCulture;
            attribute languageApproach : String;
            attribute presentationStyle : String;
            attribute rolloutApproach : String;
            attribute quickWins : String[*];
            
            // Culture-specific strategies
            static part resistantStrategy : AdoptionStrategy {
                :>> cultureType = OrganizationalCulture::Resistant;
                :>> languageApproach = "Common-sense language, avoid SE jargon";
                :>> presentationStyle = "Practical benefits, problem-solving focus";
                :>> rolloutApproach = "Phased, invisible integration";
                :>> quickWins = {"Risk identification", "Requirements clarity", "Interface management"};
            }
            
            static part tolerantStrategy : AdoptionStrategy {
                :>> cultureType = OrganizationalCulture::Tolerant;
                :>> languageApproach = "Standard terminology with practical explanations";
                :>> presentationStyle = "ROI-driven, demonstrated value";
                :>> rolloutApproach = "Champion-led, pilot projects";
                :>> quickWins = {"Process efficiency", "Defect reduction", "Stakeholder satisfaction"};
            }
            
            static part supportiveStrategy : AdoptionStrategy {
                :>> cultureType = OrganizationalCulture::Supportive;
                :>> languageApproach = "Full formal SE terminology";
                :>> presentationStyle = "Standards-based, comprehensive";
                :>> rolloutApproach = "Organization-wide, training programs";
                :>> quickWins = {"Certification readiness", "Process improvement", "Knowledge capture"};
            }
        }
    }
    
    // ============================================
    // SECTION 6: VERIFICATION FRAMEWORK
    // ============================================
    
    package VerificationFramework {
        doc /* Verification framework for tailoring decisions */;
        
        import CoreTypes::*;
        import AssessmentMethodology::*;
        import ProcessDefinitions::*;
        import Interdependencies::*;
        
        verification def VerifyTailoringDecision {
            doc 
            /*
             * Verification case for tailoring decision completeness
             * and consistency.
             */;
            
            subject decision : TailoringDecision;
            
            objective {
                doc /* Verify that tailoring decision is complete and consistent */;
            }
            
            // Verification activities
            action verifyAssessmentComplete {
                doc /* Verify all 16 metrics are scored */;
            }
            
            action verifyOverridesApplied {
                doc /* Verify mandatory overrides are correctly applied */;
            }
            
            action verifyInterdependenciesSatisfied {
                doc /* Verify interdependency rules are satisfied */;
            }
            
            action verifyCultureAlignment {
                doc /* Verify adoption strategy matches culture */;
            }
        }
        
        part def TailoringDecision {
            doc /* Complete tailoring decision for a project */;
            
            attribute projectId : String;
            attribute decisionDate : String;
            
            part assessment : ProjectAssessment;
            part processDecisions : ProcessTailoringDecision[*];
            part consistencyReport : ConsistencyReport;
            part cultureAssessment : CultureIntegration::CultureAssessment;
            
            attribute approvedBy : String;
            attribute approvalDate : String;
            
            constraint decisionValid {
                consistencyReport.isConsistent and
                processDecisions->size() >= 22 // Core processes minimum
            }
        }
        
        analysis def TailoringTradeStudy {
            doc 
            /*
             * Trade study analysis for tailoring decisions.
             * 
             * Compares different tailoring scenarios and their
             * implications for project success.
             */;
            
            attribute scenario : String;
            attribute costEstimate : Real;
            attribute scheduleImpact : Real;
            attribute riskLevel : Real;
            attribute complianceScore : Real;
            
            // Trade study objective function
            constraint objectiveFunction {
                costEstimate * 0.3 + 
                scheduleImpact * 0.2 + 
                riskLevel * 0.3 + 
                (1.0 - complianceScore) * 0.2 <= threshold
            }
        }
    }
    
    // ============================================
    // SECTION 7: VIEWS AND VIEWPOINTS
    // ============================================
    
    package ViewsAndViewpoints {
        doc /* Viewpoint-based documentation for different stakeholders */;
        
        import CoreTypes::*;
        import VerificationFramework::*;
        
        viewpoint def ProjectManagerViewpoint {
            doc /* Viewpoint for project managers */;
            
            attribute concerns : String[*] = {
                "Schedule impact",
                "Resource requirements",
                "Risk exposure",
                "Stakeholder communication"
            };
        }
        
        viewpoint def SystemsEngineerViewpoint {
            doc /* Viewpoint for systems engineers */;
            
            attribute concerns : String[*] = {
                "Process completeness",
                "Traceability",
                "Verification coverage",
                "Technical risk"
            };
        }
        
        viewpoint def ExecutiveViewpoint {
            doc /* Viewpoint for executive stakeholders */;
            
            attribute concerns : String[*] = {
                "Cost-benefit",
                "Compliance",
                "Organizational readiness",
                "Strategic alignment"
            };
        }
        
        view def TailoringSummaryView {
            doc /* Summary view of tailoring decision */;
            
            viewpoint : ProjectManagerViewpoint;
            
            attribute projectOverview : String;
            attribute assessmentSummary : String;
            attribute keyDecisions : String[*];
            attribute recommendations : String[*];
        }
        
        view def ProcessDetailView {
            doc /* Detailed view of process tailoring */;
            
            viewpoint : SystemsEngineerViewpoint;
            
            part processDecisions : ProcessTailoringDecision[*];
            part interdependencyAnalysis : String;
            part traceabilityMatrix : String;
        }
    }
    
    // ============================================
    // SECTION 8: COMPLETE TAILORING WORKFLOW
    // ============================================
    
    package TailoringWorkflow {
        doc /* Complete workflow for tailoring decision process */;
        
        import CoreTypes::*;
        import AssessmentMethodology::*;
        import ProcessDefinitions::*;
        import Interdependencies::*;
        import CultureIntegration::*;
        import VerificationFramework::*;
        
        action def PerformTailoringAssessment {
            doc 
            /*
             * Complete tailoring assessment workflow.
             * 
             * Follows the decision flow from §3.5 of the framework:
             * 1. Score 16 metrics
             * 2. Compute dimension scores
             * 3. Determine baseline level
             * 4. Apply override rules
             * 5. Check interdependency consistency
             * 6. Apply culture-adjusted adoption strategy
             * 7. Document and approve
             */;
            
            // Step 1: Score Metrics
            action scoreMetrics {
                doc /* Collaboratively score all 16 metrics */;
                out metrics : AssessmentMetric[16];
            }
            
            // Step 2: Compute Dimension Scores
            action computeDimensions {
                in metrics : AssessmentMetric[16];
                out dimensionScores : DimensionScore[4];
            }
            
            // Step 3: Determine Baseline Level
            action determineBaseline {
                in dimensionScores : DimensionScore[4];
                out baselineLevel : TailoringLevel;
                out compositeScore : Real;
            }
            
            // Step 4: Apply Override Rules
            action applyOverrides {
                in baselineLevel : TailoringLevel;
                in metrics : AssessmentMetric[16];
                out processLevels : ProcessTailoringDecision[*];
            }
            
            // Step 5: Check Interdependencies
            action checkConsistency {
                in processLevels : ProcessTailoringDecision[*];
                out consistencyReport : ConsistencyReport;
            }
            
            // Step 6: Apply Culture Strategy
            action determineAdoptionStrategy {
                in cultureType : OrganizationalCulture;
                out adoptionStrategy : AdoptionStrategy;
            }
            
            // Step 7: Document and Approve
            action documentDecision {
                in processLevels : ProcessTailoringDecision[*];
                in consistencyReport : ConsistencyReport;
                in adoptionStrategy : AdoptionStrategy;
                out tailoringDecision : TailoringDecision;
            }
            
            // Control flow
            first scoreMetrics then computeDimensions;
            first computeDimensions then determineBaseline;
            first determineBaseline then applyOverrides;
            first applyOverrides then checkConsistency;
            first checkConsistency then determineAdoptionStrategy;
            first determineAdoptionStrategy then documentDecision;
        }
    }
    
    // ============================================
    // SECTION 9: EXAMPLE INSTANTIATION
    // ============================================
    
    package ExampleInstantiation {
        doc /* Example instantiation of the tailoring framework */;
        
        import CoreTypes::*;
        import AssessmentMethodology::*;
        import VerificationFramework::*;
        
        part def UrbanLRTStationProject {
            doc 
            /*
             * Example: Urban LRT station upgrade with platform screen doors,
             * new SCADA integration, and accessibility improvements.
             * 
             * From §3.3.2 of the framework.
             */;
            
            attribute projectName : String = "Urban LRT Station Upgrade";
            
            part assessment : ProjectAssessment {
                :>> projectId = "LRT-2025-001";
                :>> assessmentDate = "2025-02-18";
                
                // System Complexity (D1 = 3.25)
                part metricM1 : AssessmentMetric {
                    :>> id = "M1";
                    :>> name = "Architectural Complexity";
                    :>> dimension = AssessmentDimension::SystemComplexity;
                    :>> score = 3;
                }
                
                part metricM2 : AssessmentMetric {
                    :>> id = "M2";
                    :>> name = "Interface Complexity";
                    :>> dimension = AssessmentDimension::SystemComplexity;
                    :>> score = 4;
                }
                
                part metricM3 : AssessmentMetric {
                    :>> id = "M3";
                    :>> name = "Technology Maturity";
                    :>> dimension = AssessmentDimension::SystemComplexity;
                    :>> score = 2;
                }
                
                part metricM4 : AssessmentMetric {
                    :>> id = "M4";
                    :>> name = "Integration Complexity";
                    :>> dimension = AssessmentDimension::SystemComplexity;
                    :>> score = 4;
                }
                
                // Safety/Criticality (D2 = 3.0)
                part metricM5 : AssessmentMetric {
                    :>> id = "M5";
                    :>> name = "Safety Impact";
                    :>> dimension = AssessmentDimension::SafetyCriticality;
                    :>> score = 4; // Platform screen doors are safety-critical
                }
                
                part metricM6 : AssessmentMetric {
                    :>> id = "M6";
                    :>> name = "Mission Criticality";
                    :>> dimension = AssessmentDimension::SafetyCriticality;
                    :>> score = 3;
                }
                
                part metricM7 : AssessmentMetric {
                    :>> id = "M7";
                    :>> name = "Environmental Impact";
                    :>> dimension = AssessmentDimension::SafetyCriticality;
                    :>> score = 2;
                }
                
                part metricM8 : AssessmentMetric {
                    :>> id = "M8";
                    :>> name = "Regulatory Compliance";
                    :>> dimension = AssessmentDimension::SafetyCriticality;
                    :>> score = 3;
                }
                
                // Project Constraints (D3 = 2.75)
                part metricM9 : AssessmentMetric {
                    :>> id = "M9";
                    :>> name = "Schedule Pressure";
                    :>> dimension = AssessmentDimension::ProjectConstraints;
                    :>> score = 4;
                }
                
                part metricM10 : AssessmentMetric {
                    :>> id = "M10";
                    :>> name = "Budget Constraints";
                    :>> dimension = AssessmentDimension::ProjectConstraints;
                    :>> score = 3;
                }
                
                part metricM11 : AssessmentMetric {
                    :>> id = "M11";
                    :>> name = "Team Experience";
                    :>> dimension = AssessmentDimension::ProjectConstraints;
                    :>> score = 2;
                }
                
                part metricM12 : AssessmentMetric {
                    :>> id = "M12";
                    :>> name = "Geographic Distribution";
                    :>> dimension = AssessmentDimension::ProjectConstraints;
                    :>> score = 2;
                }
                
                // Stakeholder Context (D4 = 2.5)
                part metricM13 : AssessmentMetric {
                    :>> id = "M13";
                    :>> name = "Stakeholder Count";
                    :>> dimension = AssessmentDimension::StakeholderContext;
                    :>> score = 3;
                }
                
                part metricM14 : AssessmentMetric {
                    :>> id = "M14";
                    :>> name = "Requirements Volatility";
                    :>> dimension = AssessmentDimension::StakeholderContext;
                    :>> score = 2;
                }
                
                part metricM15 : AssessmentMetric {
                    :>> id = "M15";
                    :>> name = "Political Sensitivity";
                    :>> dimension = AssessmentDimension::StakeholderContext;
                    :>> score = 3;
                }
                
                part metricM16 : AssessmentMetric {
                    :>> id = "M16";
                    :>> name = "Organizational Culture";
                    :>> dimension = AssessmentDimension::StakeholderContext;
                    :>> score = 2; // Tolerant
                }
                
                :>> compositeScore = 2.88;
                :>> baselineLevel = TailoringLevel::Standard;
                :>> organizationalCulture = OrganizationalCulture::Tolerant;
            }
            
            // Override check: M5 = 4 (Safety-Critical)
            // Verification, Validation, Requirements, QA elevated to ≥ Standard
            // Already met by baseline Standard level
            
            part tailoringDecision : TailoringDecision {
                :>> projectId = "LRT-2025-001";
                :>> decisionDate = "2025-02-18";
                :>> approvedBy = "Project Sponsor";
                
                part processDecision_RiskMgmt : ProcessTailoringDecision {
                    :>> processId = 12;
                    :>> processName = "Risk Management";
                    :>> determinedLevel = TailoringLevel::Standard;
                    :>> overrideApplied = false;
                    :>> consistencyCheckPassed = true;
                }
                
                part processDecision_Verification : ProcessTailoringDecision {
                    :>> processId = 25;
                    :>> processName = "Verification";
                    :>> determinedLevel = TailoringLevel::Standard;
                    :>> overrideApplied = true;
                    :>> overrideReason = "M5 >= 4 Safety-Critical override";
                    :>> consistencyCheckPassed = true;
                }
            }
        }
    }
}