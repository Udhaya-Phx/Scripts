export async function processInBatches<T>(
  tasks: (() => Promise<T>)[],
  batchSize: number,
  title: string = ""
): Promise<PromiseSettledResult<T>[]> {
  let results: PromiseSettledResult<T>[] = [];

  for (let i = 0; i < tasks.length; i += batchSize) {
    console.log(`Processing batch => ${title} => ${i + 1}/${tasks.length}`);
    const batch = tasks.slice(i, i + batchSize).map((task) => task());
    const batchResults = await Promise.allSettled(batch);
    results = results.concat(batchResults);
  }

  return results;
}
