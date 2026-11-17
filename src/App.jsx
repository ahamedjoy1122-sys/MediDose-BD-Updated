import { useEffect, useState } from 'react';
import './App.css';
import { supabase } from './supabase';

const emptyMedicine = {
  generic_name: '',
  brand_names: '',
  formulation: '',
  strength: '',
  published: false,
};
const emptyRule = {
  dose_category: '',
  medicine_id: '',
  indication: '',
  age_min_days: '',
  age_max_days: '',
  dose_value: '',
  dose_basis: 'mg/kg/dose',
  frequency_per_day: '',
  max_single_mg: '',
  max_daily_mg: '',
  concentration_mg_per_ml: '',
  duration: '',
  route: '',
  reference: '',
  review_status: 'needs_review',
};

const styles = {
  app: {
    fontFamily: 'Arial, sans-serif',
    background: '#f3f6fa',
    minHeight: '100vh',
    color: '#183047',
  },
  header: {
    background: '#075985',
    color: 'white',
    padding: 22,
    textAlign: 'center',
  },
  main: {
    maxWidth: 850,
    margin: 'auto',
    padding: 18,
  },
  panel: {
    background: 'white',
    padding: 18,
    margin: '18px 0',
    borderRadius: 12,
    boxShadow: '0 2px 8px #00000010',
  },
  input: {
    width: '100%',
    padding: 11,
    margin: '7px 0 12px',
    border: '1px solid #ccd5df',
    borderRadius: 7,
    boxSizing: 'border-box',
  },
  button: {
    background: '#087e8b',
    color: 'white',
    border: 0,
    borderRadius: 7,
    padding: '10px 15px',
    margin: '5px',
    cursor: 'pointer',
  },
  item: {
    background: '#f1f5f9',
    padding: 13,
    borderRadius: 8,
    margin: '10px 0',
  },
  footer: {
    textAlign: 'center',
    padding: 20,
    color: '#64748b',
    fontSize: 13,
  },
};

function calculatePediInjectableDose(medicineId, age, weight, rules, isAdmin) {
  const ageDays = age === '' || age == null ? null : Number(age);
  const kg = Number(weight);

  if (!medicineId) {
    return { error: 'Please select a medicine.' };
  }

  if (weight === '' || !Number.isFinite(kg) || kg <= 0) {
    return { error: 'Please enter a valid weight in kg.' };
  }

  if (ageDays !== null && (!Number.isFinite(ageDays) || ageDays < 0)) {
    return { error: 'Please enter a valid age.' };
  }

  const rule = rules.find((r) => {
    if (
      String(r.medicine_id) !== String(medicineId) ||
      (r.dose_category || '').trim().toLowerCase() !== 'pediatric' ||
      (!isAdmin && r.review_status !== 'verified')
    ) {
      return false;
    }

    const minAge = r.age_min_days;
    const maxAge = r.age_max_days;

    if (ageDays === null) {
      return minAge == null && maxAge == null;
    }

    return (
      (minAge == null || ageDays >= Number(minAge)) &&
      (maxAge == null || ageDays <= Number(maxAge))
    );
  });

  if (!rule) {
    return {
      error:
        ageDays === null
          ? 'No verified weight-based dose rule available without age.'
          : 'No verified dose rule found for this medicine and age.',
    };
  }

  const dose = Number(rule.dose_value);
  const frequency = Number(rule.frequency_per_day);
  const basis = (rule.dose_basis || '').toLowerCase().replace(/\s/g, '');

  if (dose <= 0 || frequency <= 0) {
    return { error: 'Invalid dose rule. Please review the saved data.' };
  }

  let mg;

  if (basis === 'mg/kg/dose') {
    mg = dose * kg;
  } else if (basis === 'mg/kg/day') {
    mg = (dose * kg) / frequency;
  } else if (basis === 'mg/dose') {
    mg = dose;
  } else if (basis === 'mg/day') {
    mg = dose / frequency;
  } else {
    return { error: 'Unsupported dose basis.' };
  }

  if (rule.max_single_mg != null && mg > Number(rule.max_single_mg)) {
    return { error: 'Dose exceeds maximum single dose.' };
  }

  if (rule.max_daily_mg != null && mg * frequency > Number(rule.max_daily_mg)) {
    return { error: 'Dose exceeds maximum daily dose.' };
  }

  const concentration = Number(rule.concentration_mg_per_ml);

  const volume =
    Number.isFinite(concentration) && concentration > 0
      ? mg / concentration
      : null;

  return { mg, volume, rule };
}
function App() {
  const [medicines, setMedicines] = useState([]);
  const [activePage, setActivePage] = useState('home');
  const [pediCategory, setPediCategory] = useState('');
  const [pediMedicine, setPediMedicine] = useState('');
  const [pediAge, setPediAge] = useState('');
  const [pediAgeYears, setPediAgeYears] = useState('');
  const [pediAgeMonths, setPediAgeMonths] = useState('');
  const [pediWeight, setPediWeight] = useState('');
  const [pediResult, setPediResult] = useState(null);
  const [pediIndication, setPediIndication] = useState('');
  const pediCategories = [
    'Pedi Injectable',
    'Pedi Syrup',
    'Pedi IV Fluid',
    'Pedi Drops',
  ];
  const [rules, setRules] = useState([]);
  const [search, setSearch] = useState('');
  const [age, setAge] = useState('');
  const [ageYears, setAgeYears] = useState('');
  const [ageMonths, setAgeMonths] = useState('');
  const [weight, setWeight] = useState('');
  const [selectedMedicine, setSelectedMedicine] = useState(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [message, setMessage] = useState('');

  const [medicineForm, setMedicineForm] = useState(emptyMedicine);
  const [ruleForm, setRuleForm] = useState(emptyRule);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardMedicineId, setWizardMedicineId] = useState(null);
  const [wizardMedicineForm, setWizardMedicineForm] = useState(emptyMedicine);
  const [wizardRuleForm, setWizardRuleForm] = useState(emptyRule);
  const [wizardRuleId, setWizardRuleId] = useState(null);
  const saveWizardMedicine = async () => {
    const payload = {
      ...wizardMedicineForm,
      brand_names: wizardMedicineForm.brand_names
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean),
      published: false,
    };
    let result;

    if (wizardMedicineId) {
      result = await supabase
        .from('medicines')
        .update(payload)
        .eq('id', wizardMedicineId)
        .select()
        .single();
    } else {
      result = await supabase
        .from('medicines')
        .insert([payload])
        .select()
        .single();
    }

    if (result.error) {
      alert(result.error.message);
      return;
    }

    setWizardMedicineId(result.data.id);
    setWizardStep(2);
  };
  const saveWizardRule = async () => {
    if (!wizardMedicineId) {
      alert('Please save medicine first');
      return;
    }

    const payload = {
      ...wizardRuleForm,
      medicine_id: wizardMedicineId,
      review_status: 'needs_review',

      age_min_days:
        wizardRuleForm.age_min_days === ''
          ? null
          : Number(wizardRuleForm.age_min_days),

      age_max_days:
        wizardRuleForm.age_max_days === ''
          ? null
          : Number(wizardRuleForm.age_max_days),

      dose_value: Number(wizardRuleForm.dose_value),

      frequency_per_day: Number(wizardRuleForm.frequency_per_day),

      max_single_mg:
        wizardRuleForm.max_single_mg === ''
          ? null
          : Number(wizardRuleForm.max_single_mg),
      max_daily_mg:
        wizardRuleForm.max_daily_mg === ''
          ? null
          : Number(wizardRuleForm.max_daily_mg),

      concentration_mg_per_ml:
        wizardRuleForm.concentration_mg_per_ml === ''
          ? null
          : Number(wizardRuleForm.concentration_mg_per_ml),
    };

    let result;

    if (wizardRuleId) {
      result = await supabase
        .from('dose_rules')
        .update(payload)
        .eq('id', wizardRuleId)
        .select()
        .single();
    } else {
      result = await supabase
        .from('dose_rules')
        .insert([payload])
        .select()
        .single();
    }

    if (result.error) {
      alert(result.error.message);
      return;
    }

    setWizardRuleId(result.data.id);
    setWizardStep(3);
  };

  const verifyWizardRule = async () => {
    if (!wizardRuleId) {
      alert('Dose rule not found');
      return;
    }

    if (
      !wizardRuleForm.dose_category ||
      !wizardRuleForm.dose_basis ||
      !wizardRuleForm.route.trim() ||
      Number(wizardRuleForm.dose_value) <= 0 ||
      Number(wizardRuleForm.frequency_per_day) <= 0
    ) {
      alert('Please complete all required dose information correctly');
      return;
    }

    const ageMin = wizardRuleForm.age_min_days;
    const ageMax = wizardRuleForm.age_max_days;

    if (
      (ageMin !== '' && ageMax === '') ||
      (ageMin === '' && ageMax !== '') ||
      (ageMin !== '' &&
        ageMax !== '' &&
        (Number(ageMin) < 0 || Number(ageMax) < Number(ageMin)))
    ) {
      alert('Please check the minimum and maximum age');
      return;
    }

    if (
      (wizardRuleForm.max_single_mg !== '' &&
        Number(wizardRuleForm.max_single_mg) <= 0) ||
      (wizardRuleForm.max_daily_mg !== '' &&
        Number(wizardRuleForm.max_daily_mg) <= 0) ||
      (wizardRuleForm.concentration_mg_per_ml !== '' &&
        Number(wizardRuleForm.concentration_mg_per_ml) <= 0)
    ) {
      alert('Maximum dose and concentration must be positive numbers');
      return;
    }

    const { error } = await supabase
      .from('dose_rules')
      .update({ review_status: 'verified' })
      .eq('id', wizardRuleId);

    if (error) {
      alert(error.message);
      return;
    }

    setWizardStep(4);
  };

  const publishWizardMedicine = async () => {
    if (!wizardMedicineId || !wizardRuleId) {
      alert('Medicine or Dose Rule not found');
      return;
    }

    const { data: rule, error: ruleError } = await supabase
      .from('dose_rules')
      .select('review_status')
      .eq('id', wizardRuleId)
      .single();

    if (ruleError) {
      alert(ruleError.message);
      return;
    }

    if (rule.review_status !== 'verified') {
      alert('Please verify the Dose Rule first');
      return;
    }

    const { error } = await supabase
      .from('medicines')
      .update({ published: true })
      .eq('id', wizardMedicineId);

    if (error) {
      alert(error.message);
      return;
    }

    alert('Medicine published successfully!');
    setWizardStep(5);
  };
  const [editingMedicine, setEditingMedicine] = useState(null);
  const [editingRule, setEditingRule] = useState(null);
  const [importRows, setImportRows] = useState([]);
  const [pediatricProtocols, setPediatricProtocols] = useState([]);
  const [publicProtocols, setPublicProtocols] = useState([]);
  const [importMessage, setImportMessage] = useState('');
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState([]);
  const [importErrors, setImportErrors] = useState([]);
  const handleImportFile = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setImportFile(file);
    setImportMessage('');
    setImportPreview([]);
    setImportErrors([]);
  };
  const previewImport = async () => {
    if (!importFile) {
      setImportMessage('Please select a file first.');
      return;
    }

    try {
      setImporting(true);
      setImportMessage('');
      setImportErrors([]);
      setImportPreview([]);

      const text = await importFile.text();
      const data = JSON.parse(text);

      if (
        !Array.isArray(data.medicines) ||
        !Array.isArray(data.dose_rules) ||
        !data.protocols
      ) {
        throw new Error('Invalid JSON format.');
      }

      setImportRows(data);

      setImportPreview([
        { category: 'Medicines', count: data.medicines.length },
        { category: 'Dose Rules', count: data.dose_rules.length },
        {
          category: 'Injectable',
          count: (data.protocols.injectable || []).length,
        },
        { category: 'Syrup', count: (data.protocols.syrup || []).length },
        { category: 'Drops', count: (data.protocols.drops || []).length },
        {
          category: 'Nebulization',
          count: (data.protocols.nebulization || []).length,
        },
        { category: 'Fluid', count: (data.protocols.fluid || []).length },
        {
          category: 'Anticonvulsant',
          count: (data.protocols.anticonvulsant || []).length,
        },
      ]);

      setImportMessage('JSON file read successfully!');
    } catch (error) {
      setImportErrors([error.message]);
      setImportMessage('Could not read JSON file.');
    } finally {
      setImporting(false);
    }
  };

  const importPediatricData = async () => {
    if (!importRows.protocols) {
      setImportMessage('Please preview the JSON file first.');
      return;
    }

    try {
      setImporting(true);
      setImportMessage('');

      const categories = [
        'injectable',
        'syrup',
        'drops',
        'nebulization',
        'fluid',
        'anticonvulsant',
      ];

      const rows = categories.flatMap((category) =>
        (importRows.protocols[category] || []).map((item) => ({
          category,
          dose_category:
            item.dose_category || importRows.dose_category || 'pediatric',
          medicine_form: item.medicine_form || category,
          name: item.name || item.medicine || item.drug || item.title || null,
          strength: item.strength || null,
          dose_text: item.dose || item.dose_text || null,
          frequency: item.frequency || null,
          route: item.route || null,
          source_page: item.source_page || null,
          details: item,
          source_name: importRows.source?.filename || 'Pediatric Dose Guide',
          published: false,
          review_status: 'pending',
        }))
      );

      if (rows.length === 0) {
        setImportMessage('No protocol data found.');
        return;
      }

      const { error } = await supabase.from('pediatric_protocols').insert(rows);

      if (error) throw error;

      setImportMessage(`${rows.length} records imported successfully!`);
    } catch (error) {
      setImportMessage('Import failed: ' + error.message);
    } finally {
      setImporting(false);
    }
  };
  useEffect(() => {
    loadPublicData();
    checkUser();
  }, []);

  async function loadPublicData() {
    const { data: meds, error: medError } = await supabase
      .from('medicines')
      .select('*')
      .eq('published', true)
      .order('generic_name');

    const { data: doseRules, error: ruleError } = await supabase
      .from('dose_rules')
      .select('*')
      .eq('review_status', 'verified');
    const { data: protocols, error: protocolError } = await supabase
      .from('pediatric_protocols')
      .select('*')
      .eq('published', true)
      .eq('review_status', 'verified');
    if (medError || ruleError || protocolError) {
      setMessage('Could not load public medicine data.');
      return;
    }

    setMedicines(meds || []);
    setRules(doseRules || []);
    setPublicProtocols(protocols || []);
  }

  async function loadAdminData() {
    const { data: meds, error: medError } = await supabase
      .from('medicines')
      .select('*')
      .order('generic_name');

    const { data: doseRules, error: ruleError } = await supabase
      .from('dose_rules')
      .select('*')
      .order('created_at', { ascending: false });
    const { data: protocols, error: protocolError } = await supabase
      .from('pediatric_protocols')
      .select('*')
      .order('created_at', { ascending: false });

    if (medError || ruleError || protocolError) {
      setMessage('Admin data loading failed. Check permissions.');
      return;
    }

    setMedicines(meds || []);
    setRules(doseRules || []);
    setPediatricProtocols(protocols || []);
  }

  async function checkUser() {
    const { data } = await supabase.auth.getSession();
    const currentUser = data.session?.user;

    if (!currentUser) {
      setUser(null);
      setIsAdmin(false);
      return;
    }

    setUser(currentUser);

    const { data: admin, error } = await supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', currentUser.id)
      .maybeSingle();

    const allowed = !error && Boolean(admin);
    setIsAdmin(allowed);

    if (allowed) {
      await loadAdminData();
    }
  }

  async function login(e) {
    e.preventDefault();
    setMessage('Logging in...');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    await checkUser();
    setMessage('Login successful.');
  }

  async function logout() {
    await supabase.auth.signOut();
    setUser(null);
    setIsAdmin(false);
    setSelectedMedicine(null);
    setMessage('Logged out.');
    await loadPublicData();
  }

  async function refreshData() {
    if (isAdmin) {
      await loadAdminData();
    } else {
      await loadPublicData();
    }
  }

  async function saveMedicine(e) {
    e.preventDefault();

    if (!isAdmin) return;

    const payload = {
      generic_name: medicineForm.generic_name.trim(),
      brand_names: medicineForm.brand_names
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
      formulation: medicineForm.formulation.trim(),
      strength: medicineForm.strength.trim(),
      published: medicineForm.published,
    };

    const result = editingMedicine
      ? await supabase
          .from('medicines')
          .update(payload)
          .eq('id', editingMedicine)
      : await supabase.from('medicines').insert(payload);

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    setMedicineForm(emptyMedicine);
    setEditingMedicine(null);
    setMessage('Medicine saved successfully.');
    await loadAdminData();
  }

  async function saveRule(e) {
    e.preventDefault();

    if (!isAdmin) return;

    const optionalNumber = (value) => (value === '' ? null : Number(value));

    const payload = {
      dose_category: ruleForm.dose_category,
      medicine_id: ruleForm.medicine_id,
      indication: ruleForm.indication.trim(),
      age_min_days: optionalNumber(ruleForm.age_min_days),
      age_max_days: optionalNumber(ruleForm.age_max_days),
      dose_value: Number(ruleForm.dose_value),
      dose_basis: ruleForm.dose_basis,
      frequency_per_day: Number(ruleForm.frequency_per_day),
      max_single_mg: optionalNumber(ruleForm.max_single_mg),
      max_daily_mg: optionalNumber(ruleForm.max_daily_mg),
      concentration_mg_per_ml: optionalNumber(ruleForm.concentration_mg_per_ml),
      duration: ruleForm.duration.trim(),
      route: ruleForm.route.trim(),
      reference: ruleForm.reference.trim(),
      review_status: 'needs_review',
    };
    if (
      !payload.medicine_id ||
      !payload.dose_category ||
      !Number.isFinite(payload.dose_value) ||
      payload.dose_value <= 0 ||
      (payload.age_min_days !== null && payload.age_min_days < 0) ||
      (payload.age_max_days !== null && payload.age_max_days < 0) ||
      (payload.age_min_days !== null &&
        payload.age_max_days !== null &&
        payload.age_max_days < payload.age_min_days) ||
      payload.frequency_per_day <= 0
    ) {
      setMessage('Please check the required dose rule fields.');
      return;
    }

    const result = editingRule
      ? await supabase.from('dose_rules').update(payload).eq('id', editingRule)
      : await supabase.from('dose_rules').insert(payload);

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    setRuleForm(emptyRule);
    setEditingRule(null);
    setMessage('Dose rule saved successfully.');
    await loadAdminData();
  }
  async function verifyDoseRule(id) {
    if (!isAdmin) return;

    const { error } = await supabase
      .from('dose_rules')
      .update({ review_status: 'verified' })
      .eq('id', id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage('Dose rule verified successfully.');
    await loadAdminData();
  }
  async function deleteMedicine(id) {
    if (!isAdmin) return;

    if (!window.confirm('Delete this medicine?')) return;

    const { error } = await supabase.from('medicines').delete().eq('id', id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage('Medicine deleted.');
    await loadAdminData();
  }

  async function deleteRule(id) {
    if (!isAdmin) return;

    if (!window.confirm('Delete this dose rule?')) return;

    const { error } = await supabase.from('dose_rules').delete().eq('id', id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage('Dose rule deleted.');
    await loadAdminData();
  }
  async function updatePediatricProtocol(id, updates) {
    if (!isAdmin) return;

    const { error } = await supabase
      .from('pediatric_protocols')
      .update(updates)
      .eq('id', id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage('Pediatric record updated successfully.');
    await loadAdminData();
  }
  async function deletePediatricProtocol(id) {
    if (!isAdmin) return;

    const confirmed = window.confirm(
      'Are you sure you want to delete this record?'
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from('pediatric_protocols')
      .delete()
      .eq('id', id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage('Record deleted successfully.');
    await loadAdminData();
  }
  function editPediatricProtocol(item) {
    const name = prompt('Medicine Name:', item.name || '');
    if (name === null) return;

    const category = prompt('Category:', item.category || '');
    if (category === null) return;

    const doseCategory = prompt(
      'Dose Category (pediatric/neonatal/adult):',
      item.dose_category || 'pediatric'
    );
    if (doseCategory === null) return;

    const medicineForm = prompt('Medicine Form:', item.medicine_form || '');
    if (medicineForm === null) return;
    const brandNames = prompt(
      'Brand Names (comma separated):',
      item.brand_names || ''
    );
    if (brandNames === null) return;

    const searchTerms = prompt(
      'Alternative Names / Synonyms (comma separated):',
      item.search_terms || ''
    );
    if (searchTerms === null) return;
    const strength = prompt('Strength:', item.strength || '');
    if (strength === null) return;

    const dose = prompt('Dose:', item.dose_text || '');
    if (dose === null) return;

    const frequency = prompt('Frequency:', item.frequency || '');
    if (frequency === null) return;

    const route = prompt('Route:', item.route || '');
    if (route === null) return;

    updatePediatricProtocol(item.id, {
      name: name.trim(),
      category: category.trim(),
      dose_category: doseCategory.trim().toLowerCase(),
      medicine_form: medicineForm.trim().toLowerCase(),
      strength: strength.trim(),
      brand_names: brandNames.trim(),
      search_terms: searchTerms.trim(),
      dose_text: dose.trim(),
      frequency: frequency.trim(),
      route: route.trim(),
      review_status: 'pending',
      published: false,
    });
  }
  function editMedicine(m) {
    setEditingMedicine(m.id);
    setMedicineForm({
      generic_name: m.generic_name || '',
      brand_names: Array.isArray(m.brand_names) ? m.brand_names.join(', ') : '',
      formulation: m.formulation || '',
      strength: m.strength || '',
      published: Boolean(m.published),
    });
  }

  function editRule(r) {
    setEditingRule(r.id);
    setRuleForm({
      dose_category: r.dose_category || '',
      medicine_id: r.medicine_id || '',
      indication: r.indication || '',
      age_min_days: r.age_min_days ?? '',
      age_max_days: r.age_max_days ?? '',
      dose_value: r.dose_value ?? '',
      dose_basis: r.dose_basis || 'mg/kg/dose',
      frequency_per_day: r.frequency_per_day ?? '',
      max_single_mg: r.max_single_mg ?? '',
      max_daily_mg: r.max_daily_mg ?? '',
      concentration_mg_per_ml: r.concentration_mg_per_ml ?? '',
      duration: r.duration || '',
      route: r.route || '',
      reference: r.reference || '',
      review_status: r.review_status || 'needs_review',
    });
  }

  function calculateDose(rule) {
    const kg = Number(weight);
    const ageDays = Number(age);

    if (!weight || !age || kg <= 0 || ageDays < 0) {
      return { error: 'Enter valid age in days and weight in kg.' };
    }

    if (
      ageDays < Number(rule.age_min_days) ||
      ageDays > Number(rule.age_max_days)
    ) {
      return { error: "Age is outside this rule's range." };
    }

    const dose = Number(rule.dose_value);
    const frequency = Number(rule.frequency_per_day);
    const basis = (rule.dose_basis || '').toLowerCase().replace(/\s/g, '');

    let mg;

    if (basis === 'mg/kg/dose') {
      mg = dose * kg;
    } else if (basis === 'mg/kg/day') {
      mg = (dose * kg) / frequency;
    } else if (basis === 'mg/dose') {
      mg = dose;
    } else if (basis === 'mg/day') {
      mg = dose / frequency;
    } else {
      return {
        error: 'Unsupported dose basis. Manual clinical verification required.',
      };
    }

    if (rule.max_single_mg !== null && mg > Number(rule.max_single_mg)) {
      return {
        error:
          'Calculated dose exceeds maximum single dose. Do not use this result.',
      };
    }

    if (
      rule.max_daily_mg !== null &&
      mg * frequency > Number(rule.max_daily_mg)
    ) {
      return {
        error:
          'Calculated dose exceeds maximum daily dose. Do not use this result.',
      };
    }

    const volume = rule.concentration_mg_per_ml
      ? mg / Number(rule.concentration_mg_per_ml)
      : null;

    return { mg, volume };
  }

  const filteredMedicines = medicines.filter((m) => {
    const brands = Array.isArray(m.brand_names) ? m.brand_names.join(' ') : '';

    return `${m.generic_name} ${brands}`
      .toLowerCase()
      .includes(search.toLowerCase());
  });
  const pediatricMedicines = medicines.filter((item) =>
    (item.formulation || '').toLowerCase().includes('inject')
  );
  const selectedRules = selectedMedicine
    ? rules.filter((r) => {
        return (
          r.medicine_id === selectedMedicine.id &&
          age !== '' &&
          Number(age) >= Number(r.age_min_days) &&
          Number(age) <= Number(r.age_max_days)
        );
      })
    : [];

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <h1>💊 MediDose BD</h1>
        <p>Medicine & Dose Reference</p>
      </header>

      <main style={styles.main}>
        {activePage === 'pedi-dose' && (
          <section style={styles.panel}>
            <h2>Pedi Dose</h2>

            {pediCategories.map((category) => (
              <button
                key={category}
                style={styles.button}
                onClick={() => setPediCategory(category)}
              >
                {category}
              </button>
            ))}
          </section>
        )}
        {pediCategory === 'Pedi Injectable' && (
          <section style={styles.panel}>
            <h2>Pedi Injectable Dose Calculator</h2>

            <button style={styles.button} onClick={() => setPediCategory('')}>
              Back
            </button>

            <h3>Select Medicine</h3>

            <select
              style={styles.input}
              value={pediMedicine}
              onChange={(e) => setPediMedicine(e.target.value)}
            >
              <option value="">Select Injectable Medicine</option>
              {pediatricMedicines
                .filter((m) =>
                  (m.formulation || '').toLowerCase().includes('inject')
                )
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.generic_name}
                  </option>
                ))}
            </select>

            <h3>Patient Information</h3>

            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                style={styles.input}
                type="number"
                min="0"
                placeholder="Years"
                value={pediAgeYears}
                onChange={(e) => setPediAgeYears(e.target.value)}
              />
              <input
                style={styles.input}
                type="number"
                min="0"
                max="11"
                placeholder="Months"
                value={pediAgeMonths}
                onChange={(e) => setPediAgeMonths(e.target.value)}
              />
            </div>

            <input
              style={styles.input}
              type="number"
              placeholder="Weight (kg)"
              value={pediWeight}
              onChange={(e) => setPediWeight(e.target.value)}
            />
            <button
              style={styles.button}
              onClick={() => {
                const hasAge = pediAgeYears !== '' || pediAgeMonths !== '';

                const years = Number(pediAgeYears || 0);
                const months = Number(pediAgeMonths || 0);

                if (
                  (hasAge && (years < 0 || months < 0 || months > 11)) ||
                  (!hasAge && (pediAgeYears !== '' || pediAgeMonths !== ''))
                ) {
                  setPediResult({ error: 'Enter valid age.' });
                  return;
                }

                const ageInDays = hasAge
                  ? Math.round(years * 365.25 + months * 30.4375)
                  : null;

                const result = calculatePediInjectableDose(
                  pediMedicine,
                  ageInDays,
                  pediWeight,
                  rules,
                  isAdmin
                );

                setPediResult(result);
              }}
            >
              Calculate Dose
            </button>

            {pediResult !== null && (
              <div style={styles.item}>
                {pediResult.error ? (
                  <p style={{ color: 'red' }}>{pediResult.error}</p>
                ) : (
                  <>
                    <h3>Calculated Dose</h3>
                    <p>
                      Medicine:{' '}
                      <strong>
                        {pediatricMedicines.find(
                          (m) => String(m.id) === String(pediMedicine)
                        )?.generic_name || 'Selected Medicine'}
                      </strong>
                    </p>
                    <p>
                      Amount:{' '}
                      <strong>{pediResult.mg.toFixed(2)} mg per dose</strong>
                    </p>
                    {pediResult.volume !== null && (
                      <p>
                        Volume:{' '}
                        <strong>
                          {pediResult.volume.toFixed(2)} mL per dose
                        </strong>
                      </p>
                    )}
                    <p>
                      Frequency:{' '}
                      {Number(pediResult.rule.frequency_per_day) === 1
                        ? 'OD (Once daily)'
                        : Number(pediResult.rule.frequency_per_day) === 2
                        ? 'BD (Twice daily)'
                        : Number(pediResult.rule.frequency_per_day) === 3
                        ? 'TDS (Three times daily)'
                        : `${pediResult.rule.frequency_per_day} times/day`}
                    </p>
                    <p>Route: {pediResult.rule.route || 'Not specified'}</p>
                    <p>
                      Duration: {pediResult.rule.duration || 'Not specified'}
                    </p>
                    <p>Reference: {pediResult.rule.reference}</p>
                  </>
                )}
              </div>
            )}
          </section>
        )}
        {activePage === 'home' && (
          <section style={styles.panel}>
            <h2>Welcome to MediDose BD</h2>
            <p>Select your section</p>

            <button
              style={styles.button}
              onClick={() => setActivePage('all-drugs')}
            >
              All Drugs
            </button>

            <button
              style={styles.button}
              onClick={() => setActivePage('pedi-dose')}
            >
              Pedi Dose
            </button>
          </section>
        )}

        <section style={styles.panel}>
          <h2>Medicine Search</h2>

          <input
            style={styles.input}
            placeholder="Search by Generic, Brand, Alternative name, Strength..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {filteredMedicines.map((m) => (
            <div key={m.id} style={styles.item}>
              <strong>{m.generic_name}</strong>
              <p>
                {Array.isArray(m.brand_names) ? m.brand_names.join(', ') : ''}
              </p>
              <p>
                {m.formulation} | {m.strength}
              </p>
              <button
                style={styles.button}
                onClick={() => setSelectedMedicine(m)}
              >
                View Medicine
              </button>
            </div>
          ))}

          {filteredMedicines.length === 0 && (
            <p>No published medicine found.</p>
          )}
          <h3>Pediatric Dose Records</h3>

          {publicProtocols
            .filter((item) => {
              const searchText = [
                item.name,
                item.brand_names,
                item.search_terms,
                item.category,
                item.dose_category,
                item.medicine_form,
                item.strength,
              ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

              return searchText.includes(search.trim().toLowerCase());
            })
            .map((item) => (
              <div key={item.id} style={styles.item}>
                <strong>{item.name || 'Name not available'}</strong>
                <p>Brand Names: {item.brand_names || 'N/A'}</p>
                <p>Alternative Names: {item.search_terms || 'N/A'}</p>
                <p>Dose Category: {item.dose_category}</p>
                <p>Medicine Form: {item.medicine_form}</p>
                <p>Strength: {item.strength || 'N/A'}</p>
                <p>Brand Names: {item.brand_names || 'N/A'}</p>
                <p>Alternative Names: {item.search_terms || 'N/A'}</p>
                <p>Dose: {item.dose_text || 'N/A'}</p>
                <p>Route: {item.route || 'N/A'}</p>
                <p>Frequency: {item.frequency || 'N/A'}</p>
              </div>
            ))}
        </section>

        {selectedMedicine && (
          <section style={styles.panel}>
            <h2>{selectedMedicine.generic_name}</h2>
            <p>
              {selectedMedicine.formulation} | {selectedMedicine.strength}
            </p>

            <label>Patient Age</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                style={styles.input}
                type="number"
                min="0"
                value={ageYears}
                onChange={(e) => setAgeYears(e.target.value)}
                placeholder="Years"
              />
              <input
                style={styles.input}
                type="number"
                min="0"
                max="11"
                value={ageMonths}
                onChange={(e) => setAgeMonths(e.target.value)}
                placeholder="Months"
              />
            </div>

            <label>Patient weight (kg)</label>
            <input
              style={styles.input}
              type="number"
              min="0.01"
              step="any"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="Enter weight in kg"
            />

            <h3>Verified Dose Rules</h3>

            {selectedRules.length === 0 && (
              <p>No verified rule found for this age.</p>
            )}

            {selectedRules.map((r) => {
              const result = calculateDose(r);

              return (
                <div key={r.id} style={styles.item}>
                  <strong>Indication:</strong> {r.indication}
                  <p>
                    Dose: {r.dose_value} {r.dose_basis}
                  </p>
                  <p>Route: {r.route}</p>
                  <p>Frequency/day: {r.frequency_per_day}</p>
                  <p>Duration: {r.duration}</p>
                  <p>Reference: {r.reference}</p>
                  {result.error && (
                    <p style={{ color: 'red' }}>{result.error}</p>
                  )}
                  {result.mg !== undefined && (
                    <p>
                      Calculated amount:{' '}
                      <strong>{result.mg.toFixed(2)} mg per dose</strong>
                      {result.volume !== null &&
                        ` (${result.volume.toFixed(2)} mL per dose)`}
                    </p>
                  )}
                </div>
              );
            })}

            <button
              style={styles.button}
              onClick={() => setSelectedMedicine(null)}
            >
              Close
            </button>
          </section>
        )}

        <section style={styles.panel}>
          <h2>Admin Login</h2>

          {!user ? (
            <form onSubmit={login}>
              <input
                style={styles.input}
                type="email"
                placeholder="Admin email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              <input
                style={styles.input}
                type="password"
                placeholder="Admin password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              <button style={styles.button} type="submit">
                Login
              </button>
            </form>
          ) : (
            <>
              <p>
                {isAdmin ? 'Admin access verified.' : 'You are not an admin.'}
              </p>
              <button style={styles.button} onClick={logout}>
                Logout
              </button>
            </>
          )}

          <p>{message}</p>
        </section>

        {user && isAdmin && (
          <section style={styles.panel}>
            <h2>Admin Dashboard</h2>
            <div style={styles.panel}>
              <h3>Medicine Wizard</h3>
              <p>Step {wizardStep} of 5</p>

              {wizardStep === 1 && (
                <>
                  <h4>Step 1: Medicine Information</h4>

                  <input
                    style={styles.input}
                    placeholder="Generic Name"
                    value={wizardMedicineForm.generic_name}
                    onChange={(e) =>
                      setWizardMedicineForm({
                        ...wizardMedicineForm,
                        generic_name: e.target.value,
                      })
                    }
                  />

                  <input
                    style={styles.input}
                    placeholder="Brand Names"
                    value={wizardMedicineForm.brand_names}
                    onChange={(e) =>
                      setWizardMedicineForm({
                        ...wizardMedicineForm,
                        brand_names: e.target.value,
                      })
                    }
                  />

                  <input
                    style={styles.input}
                    placeholder="Formulation"
                    value={wizardMedicineForm.formulation}
                    onChange={(e) =>
                      setWizardMedicineForm({
                        ...wizardMedicineForm,
                        formulation: e.target.value,
                      })
                    }
                  />

                  <input
                    style={styles.input}
                    placeholder="Strength"
                    value={wizardMedicineForm.strength}
                    onChange={(e) =>
                      setWizardMedicineForm({
                        ...wizardMedicineForm,
                        strength: e.target.value,
                      })
                    }
                  />

                  <button
                    style={styles.button}
                    type="button"
                    onClick={saveWizardMedicine}
                  >
                    Save Medicine & Next
                  </button>
                </>
              )}
              {wizardStep === 2 && (
                <>
                  <h4>Step 2: Dose Information</h4>

                  <select
                    style={styles.input}
                    value={wizardRuleForm.dose_category}
                    onChange={(e) =>
                      setWizardRuleForm({
                        ...wizardRuleForm,
                        dose_category: e.target.value,
                      })
                    }
                  >
                    <option value="">Select Dose Category</option>
                    <option value="pediatric">Pediatric</option>
                    <option value="neonatal">Neonatal</option>
                    <option value="adult">Adult</option>
                  </select>

                  <input
                    style={styles.input}
                    placeholder="Dose Value"
                    value={wizardRuleForm.dose_value}
                    onChange={(e) =>
                      setWizardRuleForm({
                        ...wizardRuleForm,
                        dose_value: e.target.value,
                      })
                    }
                  />

                  <select
                    style={styles.input}
                    value={wizardRuleForm.dose_basis}
                    onChange={(e) =>
                      setWizardRuleForm({
                        ...wizardRuleForm,
                        dose_basis: e.target.value,
                      })
                    }
                  >
                    <option value="">Select Dose Basis</option>
                    <option value="mg/kg/dose">mg/kg/dose</option>
                    <option value="mg/kg/day">mg/kg/day</option>
                    <option value="mg/dose">mg/dose</option>
                    <option value="mg/day">mg/day</option>
                  </select>

                  <input
                    style={styles.input}
                    placeholder="Frequency per day"
                    type="number"
                    value={wizardRuleForm.frequency_per_day}
                    onChange={(e) =>
                      setWizardRuleForm({
                        ...wizardRuleForm,
                        frequency_per_day: e.target.value,
                      })
                    }
                  />

                  <input
                    style={styles.input}
                    type="number"
                    placeholder="Minimum Age (Days)"
                    value={wizardRuleForm.age_min_days}
                    onChange={(e) =>
                      setWizardRuleForm({
                        ...wizardRuleForm,
                        age_min_days: e.target.value,
                      })
                    }
                  />

                  <input
                    style={styles.input}
                    type="number"
                    placeholder="Maximum Age (Days)"
                    value={wizardRuleForm.age_max_days}
                    onChange={(e) =>
                      setWizardRuleForm({
                        ...wizardRuleForm,
                        age_max_days: e.target.value,
                      })
                    }
                  />

                  <input
                    style={styles.input}
                    type="number"
                    placeholder="Maximum Single Dose (mg)"
                    value={wizardRuleForm.max_single_mg}
                    onChange={(e) =>
                      setWizardRuleForm({
                        ...wizardRuleForm,
                        max_single_mg: e.target.value,
                      })
                    }
                  />

                  <input
                    style={styles.input}
                    type="number"
                    placeholder="Maximum Daily Dose (mg)"
                    value={wizardRuleForm.max_daily_mg}
                    onChange={(e) =>
                      setWizardRuleForm({
                        ...wizardRuleForm,
                        max_daily_mg: e.target.value,
                      })
                    }
                  />

                  <input
                    style={styles.input}
                    type="number"
                    placeholder="Concentration (mg/mL)"
                    value={wizardRuleForm.concentration_mg_per_ml}
                    onChange={(e) =>
                      setWizardRuleForm({
                        ...wizardRuleForm,
                        concentration_mg_per_ml: e.target.value,
                      })
                    }
                  />

                  <input
                    style={styles.input}
                    placeholder="Route"
                    value={wizardRuleForm.route}
                    onChange={(e) =>
                      setWizardRuleForm({
                        ...wizardRuleForm,
                        route: e.target.value,
                      })
                    }
                  />

                  <input
                    style={styles.input}
                    placeholder="Duration"
                    value={wizardRuleForm.duration}
                    onChange={(e) =>
                      setWizardRuleForm({
                        ...wizardRuleForm,
                        duration: e.target.value,
                      })
                    }
                  />

                  <button
                    style={styles.button}
                    type="button"
                    onClick={saveWizardRule}
                  >
                    Save Dose Rule & Next
                  </button>
                </>
              )}
              {wizardStep === 3 && (
                <>
                  <h4>Step 3: Review Medicine & Dose</h4>

                  <p>
                    <strong>Generic Name:</strong>{' '}
                    {wizardMedicineForm.generic_name}
                  </p>
                  <p>
                    <strong>Brand Names:</strong>{' '}
                    {wizardMedicineForm.brand_names}
                  </p>
                  <p>
                    <strong>Formulation:</strong>{' '}
                    {wizardMedicineForm.formulation}
                  </p>
                  <p>
                    <strong>Strength:</strong> {wizardMedicineForm.strength}
                  </p>

                  <hr />

                  <p>
                    <strong>Dose Category:</strong>{' '}
                    {wizardRuleForm.dose_category}
                  </p>
                  <p>
                    <strong>Dose Value:</strong> {wizardRuleForm.dose_value}
                  </p>
                  <p>
                    <strong>Dose Basis:</strong> {wizardRuleForm.dose_basis}
                  </p>
                  <p>
                    <strong>Frequency:</strong>{' '}
                    {wizardRuleForm.frequency_per_day}
                  </p>

                  <p>
                    <strong>Minimum Age (Days):</strong>{' '}
                    {wizardRuleForm.age_min_days}
                  </p>
                  <p>
                    <strong>Maximum Age (Days):</strong>{' '}
                    {wizardRuleForm.age_max_days}
                  </p>
                  <p>
                    <strong>Maximum Single Dose (mg):</strong>{' '}
                    {wizardRuleForm.max_single_mg}
                  </p>
                  <p>
                    <strong>Maximum Daily Dose (mg):</strong>{' '}
                    {wizardRuleForm.max_daily_mg}
                  </p>
                  <p>
                    <strong>Concentration (mg/mL):</strong>{' '}
                    {wizardRuleForm.concentration_mg_per_ml}
                  </p>

                  <p>
                    <strong>Route:</strong> {wizardRuleForm.route}
                  </p>
                  <p>
                    <strong>Duration:</strong> {wizardRuleForm.duration}
                  </p>

                  <button
                    style={styles.button}
                    type="button"
                    onClick={verifyWizardRule}
                  >
                    Verify Dose Rule
                  </button>
                </>
              )}
              {wizardStep === 4 && (
                <>
                  <h4>Step 4: Dose Rule Verified</h4>

                  <p>Dose Rule has been successfully verified.</p>
                  <p>Medicine: {wizardMedicineForm.generic_name}</p>

                  <button
                    style={styles.button}
                    type="button"
                    onClick={publishWizardMedicine}
                  >
                    Publish Medicine
                  </button>
                </>
              )}
              {wizardStep === 5 && (
                <>
                  <h4>Medicine Published Successfully!</h4>

                  <p>{wizardMedicineForm.generic_name} is now published.</p>

                  <button
                    style={styles.button}
                    type="button"
                    onClick={() => {
                      setWizardStep(1);
                      setWizardMedicineId(null);
                      setWizardRuleId(null);
                      setWizardMedicineForm(emptyMedicine);
                      setWizardRuleForm(emptyRule);
                    }}
                  >
                    Add Another Medicine
                  </button>
                </>
              )}
            </div>
            <h3>{editingMedicine ? 'Edit Medicine' : 'Add Medicine'}</h3>

            <form onSubmit={saveMedicine}>
              <input
                style={styles.input}
                placeholder="Generic name"
                required
                value={medicineForm.generic_name}
                onChange={(e) =>
                  setMedicineForm({
                    ...medicineForm,
                    generic_name: e.target.value,
                  })
                }
              />

              <input
                style={styles.input}
                placeholder="Brand names (comma separated)"
                value={medicineForm.brand_names}
                onChange={(e) =>
                  setMedicineForm({
                    ...medicineForm,
                    brand_names: e.target.value,
                  })
                }
              />

              <input
                style={styles.input}
                placeholder="Formulation"
                value={medicineForm.formulation}
                onChange={(e) =>
                  setMedicineForm({
                    ...medicineForm,
                    formulation: e.target.value,
                  })
                }
              />

              <input
                style={styles.input}
                placeholder="Strength"
                value={medicineForm.strength}
                onChange={(e) =>
                  setMedicineForm({
                    ...medicineForm,
                    strength: e.target.value,
                  })
                }
              />

              <label>
                <input
                  type="checkbox"
                  checked={medicineForm.published}
                  onChange={(e) =>
                    setMedicineForm({
                      ...medicineForm,
                      published: e.target.checked,
                    })
                  }
                />
                Publish medicine
              </label>

              <br />

              <button style={styles.button} type="submit">
                Save Medicine
              </button>

              {editingMedicine && (
                <button
                  style={styles.button}
                  type="button"
                  onClick={() => {
                    setEditingMedicine(null);
                    setMedicineForm(emptyMedicine);
                  }}
                >
                  Cancel
                </button>
              )}
            </form>
            <hr />

            <h3>Bulk Import</h3>

            <input
              type="file"
              accept=".json"
              style={styles.input}
              onChange={handleImportFile}
            />

            <button style={styles.button} type="button" onClick={previewImport}>
              Preview Import
            </button>
            <button
              style={styles.button}
              type="button"
              onClick={importPediatricData}
              disabled={importing}
            >
              {importing ? 'Importing...' : 'Import to Database'}
            </button>
            {importMessage && <p>{importMessage}</p>}
            {importPreview.length > 0 && (
              <div style={styles.panel}>
                <h4>Import Preview</h4>
                {importPreview.map((item, index) => (
                  <p key={index}>
                    {item.category}: {item.count}
                  </p>
                ))}
              </div>
            )}
            {importErrors.length > 0 && (
              <div>
                {importErrors.map((error, index) => (
                  <p key={index} style={{ color: 'red' }}>
                    {error}
                  </p>
                ))}
              </div>
            )}
            <h3>Pediatric Imported Records ({pediatricProtocols.length})</h3>

            {pediatricProtocols.map((item) => (
              <div key={item.id} style={styles.panel}>
                <p>
                  <strong>{item.name || 'Name not available'}</strong>
                </p>
                <p>Category: {item.category}</p>
                <p>Dose Category: {item.dose_category || 'N/A'}</p>
                <p>Medicine Form: {item.medicine_form || 'N/A'}</p>
                <p>Strength: {item.strength || 'N/A'}</p>
                <p>Dose: {item.dose_text || 'N/A'}</p>
                <p>Status: {item.review_status}</p>
                <p>
                  Publication: {item.published ? 'Published' : 'Not published'}
                </p>
                <button
                  style={styles.button}
                  onClick={() => editPediatricProtocol(item)}
                >
                  Edit
                </button>
                <button
                  style={styles.button}
                  onClick={() =>
                    updatePediatricProtocol(item.id, {
                      review_status: 'verified',
                    })
                  }
                >
                  Verify
                </button>

                <button
                  style={styles.button}
                  onClick={() => deletePediatricProtocol(item.id)}
                >
                  Delete
                </button>

                <button
                  style={styles.button}
                  onClick={() =>
                    updatePediatricProtocol(item.id, {
                      published: true,
                    })
                  }
                  disabled={item.review_status !== 'verified'}
                >
                  Publish
                </button>
              </div>
            ))}
            <h3>Medicine List</h3>

            {medicines.map((m) => (
              <div key={m.id} style={styles.item}>
                <strong>{m.generic_name}</strong>
                <p>{m.published ? 'Published' : 'Draft'}</p>
                <button style={styles.button} onClick={() => editMedicine(m)}>
                  Edit
                </button>
                <button
                  style={styles.button}
                  onClick={() => deleteMedicine(m.id)}
                >
                  Delete
                </button>
              </div>
            ))}
            <hr />

            <h3>{editingRule ? 'Edit Dose Rule' : 'Add Dose Rule'}</h3>

            <form onSubmit={saveRule}>
              <select
                style={styles.input}
                required
                value={ruleForm.dose_category}
                onChange={(e) =>
                  setRuleForm({
                    ...ruleForm,
                    dose_category: e.target.value,
                  })
                }
              >
                <option value="">Select Dose Category</option>
                <option value="adult">Adult Dose</option>
                <option value="pediatric">Pediatric (Child) Dose</option>
                <option value="neonatal">Neonatal Dose</option>
              </select>
              <select
                style={styles.input}
                required
                value={ruleForm.medicine_id}
                onChange={(e) =>
                  setRuleForm({
                    ...ruleForm,
                    medicine_id: e.target.value,
                  })
                }
              >
                <option value="">Select medicine</option>
                {medicines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.generic_name}
                  </option>
                ))}
              </select>

              <input
                style={styles.input}
                placeholder="Indication"
                value={ruleForm.indication}
                onChange={(e) =>
                  setRuleForm({ ...ruleForm, indication: e.target.value })
                }
              />

              <input
                style={styles.input}
                type="number"
                min="0"
                placeholder="Minimum age in days (Optional)"
                value={ruleForm.age_min_days}
                onChange={(e) =>
                  setRuleForm({ ...ruleForm, age_min_days: e.target.value })
                }
              />

              <input
                style={styles.input}
                type="number"
                min="0"
                placeholder="Maximum age in days (Optional)"
                value={ruleForm.age_max_days}
                onChange={(e) =>
                  setRuleForm({ ...ruleForm, age_max_days: e.target.value })
                }
              />

              <input
                style={styles.input}
                type="number"
                min="0"
                step="any"
                placeholder="Dose value"
                required
                value={ruleForm.dose_value}
                onChange={(e) =>
                  setRuleForm({ ...ruleForm, dose_value: e.target.value })
                }
              />

              <select
                style={styles.input}
                value={ruleForm.dose_basis}
                onChange={(e) =>
                  setRuleForm({ ...ruleForm, dose_basis: e.target.value })
                }
              >
                <option value="mg/kg/dose">mg/kg/dose</option>
                <option value="mg/kg/day">mg/kg/day</option>
                <option value="mg/dose">mg/dose</option>
                <option value="mg/day">mg/day</option>
              </select>

              <input
                style={styles.input}
                type="number"
                min="1"
                placeholder="Frequency per day"
                required
                value={ruleForm.frequency_per_day}
                onChange={(e) =>
                  setRuleForm({
                    ...ruleForm,
                    frequency_per_day: e.target.value,
                  })
                }
              />

              <input
                style={styles.input}
                type="number"
                min="0"
                step="any"
                placeholder="Maximum single dose (mg)"
                value={ruleForm.max_single_mg}
                onChange={(e) =>
                  setRuleForm({
                    ...ruleForm,
                    max_single_mg: e.target.value,
                  })
                }
              />

              <input
                style={styles.input}
                type="number"
                min="0"
                step="any"
                placeholder="Maximum daily dose (mg)"
                value={ruleForm.max_daily_mg}
                onChange={(e) =>
                  setRuleForm({
                    ...ruleForm,
                    max_daily_mg: e.target.value,
                  })
                }
              />

              <input
                style={styles.input}
                type="number"
                min="0"
                step="any"
                placeholder="Concentration (mg/mL)"
                value={ruleForm.concentration_mg_per_ml}
                onChange={(e) =>
                  setRuleForm({
                    ...ruleForm,
                    concentration_mg_per_ml: e.target.value,
                  })
                }
              />

              <input
                style={styles.input}
                placeholder="Route"
                value={ruleForm.route}
                onChange={(e) =>
                  setRuleForm({ ...ruleForm, route: e.target.value })
                }
              />

              <input
                style={styles.input}
                placeholder="Duration"
                value={ruleForm.duration}
                onChange={(e) =>
                  setRuleForm({ ...ruleForm, duration: e.target.value })
                }
              />

              <input
                style={styles.input}
                placeholder="Reference (Optional)"
                value={ruleForm.reference}
                onChange={(e) =>
                  setRuleForm({ ...ruleForm, reference: e.target.value })
                }
              />

              <select
                style={styles.input}
                value={ruleForm.review_status}
                onChange={(e) =>
                  setRuleForm({
                    ...ruleForm,
                    review_status: e.target.value,
                  })
                }
              >
                <option value="needs_review">Pending review</option>
                <option value="verified">Verified</option>
              </select>

              <button style={styles.button} type="submit">
                Save Dose Rule
              </button>

              {editingRule && (
                <button
                  style={styles.button}
                  type="button"
                  onClick={() => {
                    setEditingRule(null);
                    setRuleForm(emptyRule);
                  }}
                >
                  Cancel
                </button>
              )}
            </form>

            <h3>Dose Rule List</h3>

            {rules.map((r) => (
              <div key={r.id} style={styles.item}>
                <strong>{r.indication}</strong>
                <p>Status: {r.review_status}</p>
                <button style={styles.button} onClick={() => editRule(r)}>
                  Edit
                </button>

                {r.review_status !== 'verified' && (
                  <button
                    style={styles.button}
                    onClick={() => verifyDoseRule(r.id)}
                  >
                    Verify
                  </button>
                )}

                <button style={styles.button} onClick={() => deleteRule(r.id)}>
                  Delete
                </button>
              </div>
            ))}
          </section>
        )}
      </main>

      <footer style={styles.footer}>
        Educational reference only. Verify all doses with authoritative
        references and a qualified clinician before clinical use.
      </footer>
    </div>
  );
}

export default App;
