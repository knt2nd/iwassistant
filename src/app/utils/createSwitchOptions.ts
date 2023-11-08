const Labels = {
  off: 'OFF',
  on: 'ON',
};

export function createSwitchOptions(labels: typeof Labels = Labels): SelectOption<boolean>[] {
  return [
    { value: false, label: labels.off },
    { value: true, label: labels.on },
  ];
}
