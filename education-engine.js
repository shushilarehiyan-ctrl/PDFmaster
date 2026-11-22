/* PDFMaster Offline Education Engine
   Original educational explanations.
   No API, no external model, no network dependency.
*/
(function () {
  "use strict";

  const lessons = [
    ["1-5", "Mathematics", "addition|जोड़|add numbers", "Addition means combining two or more quantities. Example: 3 + 2 = 5. We count forward to find the total."],
    ["1-5", "Mathematics", "subtraction|घटाव|subtract numbers", "Subtraction means taking one quantity away from another. Example: 7 - 3 = 4."],
    ["1-5", "Mathematics", "multiplication|गुणा|times table", "Multiplication is repeated addition. Example: 3 × 4 means 3 groups of 4, giving 12."],
    ["1-5", "Mathematics", "division|भाग|divide numbers", "Division means sharing a quantity into equal groups. Example: 12 ÷ 3 = 4."],
    ["1-5", "EVS", "environment|पर्यावरण", "Environment includes all living and non-living things around us, such as plants, animals, air, water and soil."],
    ["1-5", "Science", "living and non living things|सजीव और निर्जीव", "Living things perform life processes such as nutrition, growth and reproduction. Non-living things do not perform these life processes."],

    ["6-8", "Mathematics", "integer|integers|पूर्णांक", "Integers are positive whole numbers, negative whole numbers and zero. Examples: -3, -2, -1, 0, 1, 2, 3."],
    ["6-8", "Mathematics", "fraction|fractions|भिन्न", "A fraction represents a part of a whole. In 3/4, 3 is the numerator and 4 is the denominator."],
    ["6-8", "Science", "photosynthesis|प्रकाश संश्लेषण", "Photosynthesis is the process by which green plants use sunlight, carbon dioxide and water to prepare glucose and release oxygen. Chlorophyll absorbs light energy."],
    ["6-8", "Science", "force|बल", "Force is a push or pull that can change an object's motion, direction or shape. Its SI unit is the newton (N)."],
    ["6-8", "Science", "gravity|गुरुत्वाकर्षण", "Gravity is the attractive force between objects having mass. Earth's gravity pulls objects toward its centre."],
    ["6-8", "Science", "atom|परमाणु", "An atom is the basic unit of a chemical element. It contains protons and neutrons in the nucleus, with electrons around the nucleus."],
    ["6-8", "Science", "physical and chemical change", "A physical change alters form or state without creating a new substance. A chemical change produces one or more new substances."],
    ["6-8", "Social Science", "constitution|संविधान", "A constitution is the fundamental set of rules and principles according to which a country is governed. It defines institutions, powers and citizens' rights."],

    ["9-10", "Mathematics", "linear equation|रेखीय समीकरण", "A linear equation in one variable can be written as ax + b = 0, where a is not zero. Example: 2x + 4 = 10 gives x = 3."],
    ["9-10", "Mathematics", "quadratic equation|द्विघात समीकरण", "A quadratic equation has the standard form ax² + bx + c = 0, where a is not zero. Its roots can be found using factorisation or the quadratic formula."],
    ["9-10", "Mathematics", "pythagoras theorem|पाइथागोरस प्रमेय", "In a right-angled triangle, the square of the hypotenuse equals the sum of the squares of the other two sides: c² = a² + b²."],
    ["9-10", "Science", "newtons first law|law of inertia|जड़त्व का नियम", "Newton's first law states that an object remains at rest or in uniform straight-line motion unless acted upon by a net external force."],
    ["9-10", "Science", "ohms law|ओम का नियम", "Ohm's law states that, at constant physical conditions, voltage is proportional to current. V = IR, where V is voltage, I is current and R is resistance."],
    ["9-10", "Science", "acid and base|अम्ल और क्षार", "Acids donate protons in the Brønsted-Lowry model, while bases accept protons. Aqueous acids commonly have pH below 7 and bases above 7."],
    ["9-10", "Science", "cell|कोशिका|cell is basic unit of life", "The cell is the basic structural and functional unit of life. Some organisms consist of one cell, while others contain many specialised cells."],
    ["9-10", "Social Science", "democracy|लोकतंत्र", "Democracy is a system of government in which people have a role in choosing their representatives and influencing public decisions."],

    ["11-12", "Physics", "newtons second law|न्यूटन का दूसरा नियम", "Newton's second law relates net force to the rate of change of momentum. For constant mass, F = ma, where F is net force, m is mass and a is acceleration."],
    ["11-12", "Physics", "work energy theorem|कार्य ऊर्जा प्रमेय", "The net work done on an object equals the change in its kinetic energy: W_net = K_final - K_initial."],
    ["11-12", "Physics", "simple harmonic motion|shm|सरल आवर्त गति", "Simple harmonic motion is periodic motion in which acceleration is proportional to displacement from equilibrium and directed toward equilibrium: a = -ω²x."],
    ["11-12", "Chemistry", "mole concept|मोल संकल्पना", "One mole contains exactly 6.02214076 × 10²³ specified elementary entities. This number is the Avogadro constant."],
    ["11-12", "Chemistry", "periodic table|आवर्त सारणी", "The modern periodic table arranges elements by increasing atomic number. Elements in the same group often have similar valence-electron patterns and chemical properties."],
    ["11-12", "Chemistry", "chemical equilibrium|रासायनिक साम्य", "At dynamic chemical equilibrium, forward and reverse reaction rates are equal. The concentrations remain constant over time, though reactions continue."],
    ["11-12", "Mathematics", "derivative|अवकलज|differentiation", "A derivative measures the instantaneous rate of change of a function. For example, if f(x) = x², then f'(x) = 2x."],
    ["11-12", "Mathematics", "integration|समाकलन", "Integration is the inverse process of differentiation in many contexts. For example, the indefinite integral of x² is x³/3 + C."],
    ["11-12", "Biology", "dna|डीएनए|deoxyribonucleic acid", "DNA is a molecule that stores hereditary information in most organisms. Its two strands form a double helix, with complementary base pairs A-T and G-C."],
    ["11-12", "Biology", "mitochondria|माइटोकॉन्ड्रिया", "Mitochondria are organelles involved in aerobic cellular respiration. They help produce ATP, which cells use as an energy currency."],
    ["11-12", "Biology", "mendel law of segregation|मेंडल का पृथक्करण नियम", "Mendel's law of segregation states that the two alleles of a gene separate during gamete formation, so each gamete receives one allele."],
    ["11-12", "Biology", "natural selection|प्राकृतिक चयन", "Natural selection occurs when heritable variations affect survival and reproductive success. Traits that improve reproductive success can become more common over generations."],
    ["11-12", "Commerce", "demand|मांग", "In economics, demand describes the quantity of a good consumers are willing and able to buy at different prices during a given period."],
    ["11-12", "Commerce", "accounting equation|लेखांकन समीकरण", "The basic accounting equation is Assets = Liabilities + Capital. It expresses the relationship between what a business owns and the claims against those assets."]
  ];

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKC")
      .replace(/[\u0027\u2019]/g, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function answer(question) {
    const query = normalize(question);
    if (!query) return null;

    let best = null;
    let bestScore = 0;

    for (const row of lessons) {
      const aliases = row[2].split("|").map(normalize);
      for (const alias of aliases) {
        if (!alias) continue;
        let score = 0;
        if (query === alias) score = 100;
        else if (query.includes(alias)) score = 80 + Math.min(alias.length / 100, 0.9);
        else if (alias.includes(query) && query.length >= 5) score = 65;

        if (score > bestScore) {
          bestScore = score;
          best = row;
        }
      }
    }

    if (!best) return null;
    return "[Class " + best[0] + " | " + best[1] + "]\n" + best[3];
  }

  window.PDFMASTER_EDUCATION = {
    answer: answer,
    count: lessons.length,
    version: "1.0"
  };
})();
