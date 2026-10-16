import type {OnSearch} from '@rspress/core/theme';

// The theme groups results by page. Show a matching page once, so its many
// body snippets cannot hide other tasks. Symbol-only matches stay intact.
export const onSearch: OnSearch = (_query, groups) => {
  for (const group of groups) {
    const titles = new Set(group.result.filter(item => item.type === 'title').map(item => item.title));
    group.result = group.result.filter(item => item.type === 'title' || !titles.has(item.title));
    group.result.sort((a, b) => Number(b.type === 'title') - Number(a.type === 'title'));
  }
};
