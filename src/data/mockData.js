export function generateMockData(count = 20000) {
  const statuses = ['Open', 'In Review', 'Closed', 'Assigned']
  const firstNames = ['Alex', 'Sam', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie', 'Avery', 'Drew']
  const lastNames = ['Smith', 'Johnson', 'Lee', 'Brown', 'Wilson', 'Garcia', 'Martinez', 'Taylor', 'Anderson', 'Thomas']

  const data = []
  for (let i = 1; i <= count; i++) {
    const name = `${firstNames[i % firstNames.length]} ${lastNames[i % lastNames.length]}`
    const policyNumber = `POL-${100000 + i}`
    const status = statuses[Math.floor(Math.random() * statuses.length)]
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    data.push({ id: i, name, policyNumber, status, date })
  }

  return data
}

// Export a pre-built data array for modules that need a dataset instance
export const DATA = generateMockData()
