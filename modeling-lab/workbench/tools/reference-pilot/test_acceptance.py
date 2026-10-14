import copy
import unittest
from acceptance_suite import common_input_signature

class CommonFacts(unittest.TestCase):
    def test_prose_can_differ_but_assertion_polarity_cannot(self):
        a = {'facts': {'satisfaction': [('R','P','positive')], 'constraintKinds': [('R','C','requirement')], 'documentation': [('R','wording A')]}}
        b = copy.deepcopy(a); b['facts']['documentation'] = [('R','wording B')]
        self.assertEqual(common_input_signature(a), common_input_signature(b))
        b['facts']['satisfaction'] = [('R','P','negative')]
        self.assertNotEqual(common_input_signature(a), common_input_signature(b))
        b = copy.deepcopy(a); b['facts']['constraintKinds'] = [('R','C','assumption')]
        self.assertNotEqual(common_input_signature(a), common_input_signature(b))

if __name__ == '__main__': unittest.main()
