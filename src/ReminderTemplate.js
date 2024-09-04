import ejs from 'ejs'

const TEMPLATE_FILE = './src/template.ejs'

/**
 * Reminder template.
 * @type {string}
 */
export const localTemplate =
    'Hi <%= clientDisplayName %>,\n\nThis is a reminder for your appointment tomorrow at <%= StartDateTime %> at Glow.\n\nPlease note that if your appointment is for laser treatmen, please ensure you have shaved prior to your appointment.\n\nOur address is:\n\nGlow Hong Kong\n8/F Silver Fortune Plaza\n1 Wellington Street, Central\nhttps://goo.gl/maps/WLUDFpEQvWPuvr8q8\n\nThe entrance to Silver Fortune Plaza is on Wyndham Street up the hill slightly from the Bank of China and is approximately 25 metres up Wyndham Street from the Marks % Spencers located on the corner of Wyndham Street and Queens Road Central\n\nSee you tomorrow!\n\nPhone: +852 25255198\n\nWhatsApp: +852 96802107\n\nCancellation or rescheduling of an appointment must occur not less than 24 hours before your appointment time. Please see the link to our cancellation policy below\n\nhttps?//www.glowspa.hk/cancellation-sales-policy'


/**
 * Render a template with data.
 * @param {string} template - The template to render.
 * @param {object} data - The data to render with.
 * @returns {Promise<string>} The rendered template.
 */
async function renderMessage(template, data) {
    return ejs.renderFile(template, data)
}

console.log(await renderMessage(TEMPLATE_FILE, {clientDisplayName: 'Barry', StartDateTime: '2020-01-01'}))