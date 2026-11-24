export async function selectOption(page, label, option, scope=page){const trigger=scope.getByRole('combobox',{name:label,exact:true});await trigger.click();await page.getByRole('option',{name:option,exact:true}).click();await trigger.waitFor({state:'visible'})}
export async function themeOption(page, theme){await selectOption(page,'主题',({light:'浅色',dark:'深色',system:'跟随系统'})[theme])}
