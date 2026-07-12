package local.sysml.validator;

import org.eclipse.emf.ecore.EClass;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.EPackage;
import org.eclipse.emf.ecore.EReference;
import org.eclipse.emf.ecore.EcoreFactory;
import org.eclipse.emf.ecore.EcorePackage;

public final class PortConjugationTransientRuleTest {
    public static void main(String[] args) {
        EPackage sysmlPackage = modelPackage("https://www.omg.org/spec/SysML/20250201");
        EClass portConjugationClass = modelClass(sysmlPackage, "PortConjugation");
        EReference originalPortDefinition = reference(portConjugationClass, "originalPortDefinition");
        EReference conjugatedPortDefinition = reference(portConjugationClass, "conjugatedPortDefinition");
        EObject portConjugation = sysmlPackage.getEFactoryInstance().create(portConjugationClass);
        expect(true, Application.isImpliedPortConjugationEndpoint(
            portConjugation,
            originalPortDefinition));
        expect(false, Application.isImpliedPortConjugationEndpoint(
            portConjugation,
            conjugatedPortDefinition));

        EPackage otherPackage = modelPackage("https://example.invalid/not-sysml");
        EClass otherPortConjugationClass = modelClass(otherPackage, "PortConjugation");
        EReference otherOriginalPortDefinition = reference(
            otherPortConjugationClass, "originalPortDefinition");
        EObject otherPortConjugation = otherPackage.getEFactoryInstance().create(otherPortConjugationClass);
        expect(false, Application.isImpliedPortConjugationEndpoint(
            otherPortConjugation,
            otherOriginalPortDefinition));
        System.out.println("PASS: exact implied PortConjugation endpoint filter");
    }

    private static EPackage modelPackage(String nsUri) {
        EPackage modelPackage = EcoreFactory.eINSTANCE.createEPackage();
        modelPackage.setName("sysml");
        modelPackage.setNsPrefix("sysml");
        modelPackage.setNsURI(nsUri);
        return modelPackage;
    }

    private static EClass modelClass(EPackage modelPackage, String name) {
        EClass modelClass = EcoreFactory.eINSTANCE.createEClass();
        modelClass.setName(name);
        modelPackage.getEClassifiers().add(modelClass);
        return modelClass;
    }

    private static EReference reference(EClass owner, String name) {
        EReference reference = EcoreFactory.eINSTANCE.createEReference();
        reference.setName(name);
        reference.setEType(EcorePackage.Literals.EOBJECT);
        owner.getEStructuralFeatures().add(reference);
        return reference;
    }

    private static void expect(boolean expected, boolean actual) {
        if (expected != actual) {
            throw new AssertionError("expected=" + expected + " actual=" + actual);
        }
    }
}
