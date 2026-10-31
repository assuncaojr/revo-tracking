package br.com.revomidia.tracking.engine

import br.com.revomidia.tracking.model.Option
import java.text.Normalizer

/**
 * Sugestões de autocompletar para o tipo `name`: compara sem acento e sem caixa com o rótulo e os apelidos.
 * Começa com o texto digitado > contém o texto. Em 2024, o mesmo nome apareceu como "Lycia", "Lucia", "Licya".
 */
fun suggest(list: List<Option>, typed: String, limit: Int = 5): List<Option> {
    val t = fold(typed)
    if (t.isEmpty()) return emptyList()
    fun names(o: Option) = (listOf(o.label) + o.aliases).map(::fold)
    val starts = list.filter { o -> names(o).any { n -> n.startsWith(t) || n.split(' ').any { it.startsWith(t) } } }
    val contains = list.filter { o -> o !in starts && names(o).any { it.contains(t) } }
    return (starts + contains).take(limit)
}

internal fun fold(s: String): String =
    Normalizer.normalize(s, Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "").lowercase().trim()
